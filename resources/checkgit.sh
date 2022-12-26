# Exit immediately if any subcommand terminated
trap "exit 1" ERR

#
# This script determines if current git state is the up to date main. If so
# it exits normally. If not it prompts for an explicit continue. This script
# intends to protect from versioning for NPM without first pushing changes
# and including any changes on main.
#

# First fetch to ensure git is up to da