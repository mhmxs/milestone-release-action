const action = require('./lib/milestone-release-action');

if (require.main === module) {
    action.run();
}

module.exports = action;
