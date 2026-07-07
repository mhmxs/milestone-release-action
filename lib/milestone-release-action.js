const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');
const fs = require('fs');
const path = require('path');

function getServerUrl(env = process.env) {
    return env.GITHUB_SERVER_URL || 'https://github.com';
}

function isGitHubDotCom(serverUrl) {
    return new URL(serverUrl).hostname === 'github.com';
}

function getMilestoneReference(serverUrl, milestone) {
    return isGitHubDotCom(serverUrl) ? milestone.number : milestone.id;
}

async function listMilestones(octokit, owner, repo) {
    const { data } = await octokit.rest.issues.listMilestones({
        owner,
        repo,
    });

    return data;
}

async function closeMilestone(octokit, owner, repo, milestoneNumber) {
    return octokit.rest.issues.updateMilestone({
        owner,
        repo,
        milestone_number: milestoneNumber,
        state: 'closed'
    });
}

async function createMilestone(octokit, owner, repo, title) {
    return octokit.rest.issues.createMilestone({
        owner,
        repo,
        title
    });
}

async function listClosedIssues(octokit, owner, repo, milestoneNumber) {
    const options = octokit.rest.issues.listForRepo.endpoint.merge({
        owner,
        repo,
        milestone: milestoneNumber,
        state: 'closed'
    });

    return octokit.paginate(options);
}

function buildReleaseNotes(issues, milestoneId, preBody, postBody) {
    let notes = '';

    if (preBody !== '') {
        notes += `${preBody}\n`;
    }

    for (const issue of issues) {
        if (issue.milestone != null && issue.milestone.id === milestoneId) {
            notes += `- #${issue.number} ${issue.title}\n`;
        }
    }

    if (postBody !== '') {
        notes += `\n${postBody}`;
    }

    return notes;
}

async function createRelease(octokit, owner, repo, release) {
    const { data } = await octokit.rest.repos.createRelease({
        owner,
        repo,
        tag_name: release.tagName,
        name: release.name,
        draft: release.draft,
        prerelease: release.prerelease,
        body: release.body
    });

    return data;
}

function uploadReleaseAsset({
    httpsModule = https,
    fsModule = fs,
    pathModule = path,
    serverUrl,
    owner,
    repo,
    releaseId,
    filePath,
    token,
}) {
    const fileData = fsModule.readFileSync(filePath);
    const uploadPathPrefix = isGitHubDotCom(serverUrl) ? '' : '/api/v1';
    const hostname = isGitHubDotCom(serverUrl)
        ? 'uploads.github.com'
        : new URL(serverUrl).hostname;

    return new Promise((resolve, reject) => {
        const req = httpsModule.request({
            hostname,
            path: `${uploadPathPrefix}/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(pathModule.basename(filePath))}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Authorization': isGitHubDotCom(serverUrl) ? `Bearer ${token}` : `token ${token}`,
                'Content-Length': fileData.length,
            },
        }, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseBody);
                    return;
                }

                reject(new Error(`Upload failed with status ${res.statusCode}: ${responseBody}`));
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(fileData);
        req.end();
    });
}

async function run({
    coreModule = core,
    githubModule = github,
    httpsModule = https,
    fsModule = fs,
    pathModule = path,
    env = process.env,
    logger = console,
} = {}) {
    try {
        const token = env.GITHUB_TOKEN || env.GITEA_TOKEN || coreModule.getInput('github-token');
        const ghOwner = githubModule.context.repo.owner;
        const ghRepo = githubModule.context.repo.repo;
        const milestoneTitle = coreModule.getInput('milestone-title');
        const milestoneNext = coreModule.getInput('milestone-next');
        const preBody = coreModule.getInput('pre-body');
        const postBody = coreModule.getInput('post-body');
        const draft = coreModule.getInput('draft') === 'true';
        const prerelease = coreModule.getInput('prerelease') === 'true';
        const files = coreModule.getInput('files');
        const serverUrl = getServerUrl(env);

        logger.log(`Checking Milestone ${milestoneTitle}`);

        const octokit = githubModule.getOctokit(token);
        const milestones = await listMilestones(octokit, ghOwner, ghRepo);
        const milestone = milestones.find((currentMilestone) => currentMilestone.title === milestoneTitle);

        if (milestone == null) {
            logger.log(`Milestone ${milestoneTitle} Not Found!`);
            return;
        }

        logger.log(`Found Milestone ${milestone.title}`);

        if (milestone.open_issues > 0) {
            logger.log(`Milestone ${milestone.title} still has ${milestone.open_issues} open issues!`);
        } else {
            logger.log(`Milestone ${milestone.title} has no issues open.`);
        }

        await closeMilestone(octokit, ghOwner, ghRepo, getMilestoneReference(serverUrl, milestone));
        logger.log(`Closed Milestone ${milestone.title}`);

        if (milestoneNext != null && milestoneNext.length > 0) {
            const nextTitle = milestoneNext.replace('-SNAPSHOT', '');
            const nextMilestone = milestones.find((currentMilestone) => currentMilestone.title === nextTitle);

            if (nextMilestone == null) {
                await createMilestone(octokit, ghOwner, ghRepo, nextTitle);
                logger.log(`Created Milestone ${nextTitle}`);
            }
        }

        const issues = await listClosedIssues(octokit, ghOwner, ghRepo, getMilestoneReference(serverUrl, milestone));
        const notes = buildReleaseNotes(issues, milestone.id, preBody, postBody);

        logger.log(`Generated change log:\n ${notes}`);

        const release = await createRelease(octokit, ghOwner, ghRepo, {
            tagName: milestoneTitle,
            name: milestoneTitle,
            draft,
            prerelease,
            body: notes,
        });

        for (const filePath of files.split(',').map((value) => value.trim()).filter(Boolean)) {
            await uploadReleaseAsset({
                httpsModule,
                fsModule,
                pathModule,
                serverUrl,
                owner: ghOwner,
                repo: ghRepo,
                releaseId: release.id,
                filePath,
                token,
            });

            logger.log(`Asset uploaded: ${filePath}`);
        }

        logger.log(`Created Release ${milestone.title}`);
    } catch (error) {
        if (typeof logger.debug === 'function') {
            logger.debug(error);
        }

        coreModule.setFailed(error.message || 'Unknown Error!');
    }
}

module.exports = {
    buildReleaseNotes,
    closeMilestone,
    createMilestone,
    createRelease,
    getMilestoneReference,
    getServerUrl,
    isGitHubDotCom,
    listClosedIssues,
    listMilestones,
    run,
    uploadReleaseAsset,
};
