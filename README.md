# Milestone Release action

This actions creates a project Release from a Milestone and generates the change log with the closed issues associated 
to the Milestone. The main purpose is to help with post actions for the project release:

- Search the given Milestone
- Report Open Issues
- Close the Milestone
- Create the next Milestone
- Generate Changelog from the closed issues associated with the Milestone
- Create Project Release with the Changelog 

## Inputs

### `github-token`

**Required** The GitHub Token used to create an authenticated client. The Github Token is already set by the Github 
Action itself. Use this if you want to pass in your own Personal Access Token. 

**Default** `${{github.token}}`.

### `milestone-title`

**Required** The Milestone Title to search for in the Repository.

### `milestone-next`

**Optional** The Milestone Title to create in the Repository.

### `pre-body`

**Optional** Body content above the changelog.

### `post-body`

**Optional** Body content below the changelog.

### `draft`

**Optional** Draft flag of the release.

### `prerelease`

**Optional** Pre-release flag of the release.

## Example usage

```yaml
- uses: mhmxs/milestone-release-action@main
  name: milestone release
  with:
    github-token: ${{secrets.GITHUB_TOKEN}}
    milestone-title: '2.0.0'
```

Most likely you want for the `milestone-title` to be dynamic. You could retrieve the milestone title associated with 
your context, by querying something in your project that provides you that information and then pass it as a variable:

```yaml
- uses: mhmxs/milestone-release-action@main
  name: milestone release
  with:
    github-token: ${{secrets.GITHUB_TOKEN}}
    milestone-title: ${{steps.version.outputs.project-version}}
```
