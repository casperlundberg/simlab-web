.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: check
check: ## Everything CI runs
	npm run typecheck
	npm test
	npm run build
	$(MAKE) scripts-test

.PHONY: version
version: ## Print this checkout's semantic version
	@scripts/version.sh

.PHONY: scripts-test
scripts-test: ## Test the version and release scripts against real repositories
	scripts/version_test.sh
	scripts/release_test.sh

.PHONY: release
release: ## Tag and push a release: make release VERSION=1.3.0
	scripts/release.sh $(VERSION)
