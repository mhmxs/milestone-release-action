const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const {
    closeMilestone,
    createMilestone,
    createRelease,
    listClosedIssues,
    listMilestones,
    uploadReleaseAsset,
} = require('./index');

async function testListMilestonesCall() {
    const recorded = [];
    const octokit = {
        rest: {
            issues: {
                listMilestones: async (params) => {
                    recorded.push(params);
                    return {
                        data: [{ title: '1.0.0' }]
                    };
                }
            }
        }
    };

    const milestones = await listMilestones(octokit, 'owner', 'repo');

    assert.deepEqual(recorded, [{ owner: 'owner', repo: 'repo' }]);
    assert.deepEqual(milestones, [{ title: '1.0.0' }]);
}

async function testCloseMilestoneCall() {
    const recorded = [];
    const octokit = {
        rest: {
            issues: {
                updateMilestone: async (params) => {
                    recorded.push(params);
                    return { ok: true };
                }
            }
        }
    };

    await closeMilestone(octokit, 'owner', 'repo', 7);

    assert.deepEqual(recorded, [{
        owner: 'owner',
        repo: 'repo',
        milestone_number: 7,
        state: 'closed'
    }]);
}

async function testCreateMilestoneCall() {
    const recorded = [];
    const octokit = {
        rest: {
            issues: {
                createMilestone: async (params) => {
                    recorded.push(params);
                    return { ok: true };
                }
            }
        }
    };

    await createMilestone(octokit, 'owner', 'repo', '2.0.0');

    assert.deepEqual(recorded, [{
        owner: 'owner',
        repo: 'repo',
        title: '2.0.0'
    }]);
}

async function testListClosedIssuesCall() {
    const recorded = [];
    const mergedOptions = { url: '/issues' };
    const octokit = {
        rest: {
            issues: {
                listForRepo: {
                    endpoint: {
                        merge: (params) => {
                            recorded.push({ type: 'merge', params });
                            return mergedOptions;
                        }
                    }
                }
            }
        },
        paginate: async (options) => {
            recorded.push({ type: 'paginate', options });
            return [{ number: 42 }];
        }
    };

    const issues = await listClosedIssues(octokit, 'owner', 'repo', 8);

    assert.deepEqual(recorded, [
        {
            type: 'merge',
            params: {
                owner: 'owner',
                repo: 'repo',
                milestone: 8,
                state: 'closed'
            }
        },
        {
            type: 'paginate',
            options: mergedOptions
        }
    ]);
    assert.deepEqual(issues, [{ number: 42 }]);
}

async function testCreateReleaseCall() {
    const recorded = [];
    const octokit = {
        rest: {
            repos: {
                createRelease: async (params) => {
                    recorded.push(params);
                    return {
                        data: { id: 99 }
                    };
                }
            }
        }
    };

    const release = await createRelease(octokit, 'owner', 'repo', {
        tagName: '1.0.0',
        name: '1.0.0',
        draft: false,
        prerelease: true,
        body: 'notes'
    });

    assert.deepEqual(recorded, [{
        owner: 'owner',
        repo: 'repo',
        tag_name: '1.0.0',
        name: '1.0.0',
        draft: false,
        prerelease: true,
        body: 'notes'
    }]);
    assert.deepEqual(release, { id: 99 });
}

async function testUploadReleaseAssetCall() {
    const recorded = {
        options: null,
        written: null,
        ended: false,
    };
    const httpsModule = {
        request: (options, callback) => {
            recorded.options = options;

            const req = new EventEmitter();
            req.write = (data) => {
                recorded.written = data;
            };
            req.end = () => {
                recorded.ended = true;

                const res = new EventEmitter();
                res.statusCode = 201;
                callback(res);
                res.emit('data', 'uploaded');
                res.emit('end');
            };

            return req;
        }
    };
    const fsModule = {
        readFileSync: (filePath) => {
            assert.equal(filePath, '/tmp/example.zip');
            return Buffer.from('payload');
        }
    };

    await uploadReleaseAsset({
        httpsModule,
        fsModule,
        serverUrl: 'https://github.com',
        owner: 'owner',
        repo: 'repo',
        releaseId: 100,
        filePath: '/tmp/example.zip',
        token: 'secret-token',
    });

    assert.deepEqual(recorded.options, {
        hostname: 'uploads.github.com',
        path: '/repos/owner/repo/releases/100/assets?name=example.zip',
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Authorization': 'token secret-token',
            'Content-Length': Buffer.from('payload').length,
        },
    });
    assert.deepEqual(recorded.written, Buffer.from('payload'));
    assert.equal(recorded.ended, true);
}

async function runAllHttpCallTests() {
    await testListMilestonesCall();
    await testCloseMilestoneCall();
    await testCreateMilestoneCall();
    await testListClosedIssuesCall();
    await testCreateReleaseCall();
    await testUploadReleaseAssetCall();
}

if (require.main === module) {
    runAllHttpCallTests()
        .then(() => {
            console.log('All manual HTTP call tests passed.');
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}

module.exports = {
    runAllHttpCallTests,
    testCloseMilestoneCall,
    testCreateMilestoneCall,
    testCreateReleaseCall,
    testListClosedIssuesCall,
    testListMilestonesCall,
    testUploadReleaseAssetCall,
};
