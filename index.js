const core = require('@actions/core');
const github = require('@actions/github');

try {
    const token = core.getInput('github-token');
    const ghOwner = github.context.repo.owner;
    const ghRepo = github.context.repo.repo;
    const milestoneTitle = core.getInput('milestone-title');
    const milestoneNext = core.getInput('milestone-next');
    const preBody = core.getInput('pre-body');
    const postBody = core.getInput('post-body');
    const draft = core.getInput('draft') == "true" ? true : false;
    const prerelease = core.getInput('prerelease') == "true" ? true : false;
    console.log(`Checking Milestone ${milestoneTitle}`);

    const octokit = github.getOctokit(token);

    octokit.rest.issues.listMilestones({
        owner: ghOwner,
        repo: ghRepo,
    }).then(({data}) => {

        let milestone = data.find(function (milestone) {
            return milestone.title === milestoneTitle;
        });

        if (milestone == null) {
            console.log(`Milestone ${milestoneTitle} Not Found!`);
            return;
        }

        console.log(`Found Milestone ${milestone.title}`, milestone);

        if (milestone.open_issues > 0) {
            console.log(`Milestone ${milestone.title} still has ${milestone.open_issues} open issues!`);

            // TODO - Remove issues from Milestone?

        } else {
            console.log(`Milestone ${milestone.title} has no issues open.`);
        }

        octokit.rest.issues.updateMilestone({
            owner: ghOwner,
            repo: ghRepo,
            milestone_number: milestone.number,
            state: 'closed'
        });

        console.log(`Closed Milestone ${milestone.title}`);

        if (milestoneNext != null && milestoneNext.length > 0) {
            var milestoneTitleCreate = milestoneNext.replace("-SNAPSHOT", "");
            let milestone = data.find(function (milestone) {
                return milestone.title === milestoneTitleCreate;
            });
            if (milestone == null) {
                octokit.rest.issues.createMilestone({
                    owner: ghOwner,
                    repo: ghRepo,
                    title: milestoneTitleCreate
                })

                console.log(`Created Milestone ${milestoneTitleCreate}`);
            }
        }

        const options = octokit.rest.issues.listForRepo.endpoint.merge({
            owner: ghOwner,
            repo: ghRepo,
            milestone: milestone.number,
            state: 'closed'
        });

        octokit.paginate(options).then(issues => {
            let notes = "";
            if (preBody != "") {
                preBody + "\n"
            }
            for (const issue of issues) {
                notes = notes + "- #" + issue.number + " " + issue.title + "\n";
            }
            if (postBody != "") {
                notes += "\n" + postBody
            }

            console.log(`Generated change log:\n ${notes}`);

            octokit.rest.repos.createRelease({
                owner: ghOwner,
                repo: ghRepo,
                tag_name: milestoneTitle,
                name: milestoneTitle,
                draft: draft,
                prerelease: prerelease,
                body: notes
            });

            console.log(`Created Release ${milestone.title}`);
        });

    }).catch((error) => {
        console.debug(error);
        core.setFailed('Unknown Error!')
    })

} catch (error) {
    core.setFailed(error.message);
}
