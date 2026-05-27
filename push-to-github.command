#!/bin/zsh
cd "$(dirname "$0")"
GIT_DIR="$PWD/_git_repo" GIT_WORK_TREE="$PWD" git push -u origin main
