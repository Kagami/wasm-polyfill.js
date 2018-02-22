all: wasm-polyfill.js webextension

node_modules/long/package.json:
	npm install

# This uses rollup to make a single-file bundle,
# then lightly hacks it to avoid clobbering an existing WebAssembly global.
wasm-polyfill.js: src/*.js src/translate/*.js node_modules/long/package.json rollup.config.js
	node_modules/.bin/rollup -c
	sed -i 's/\([a-z]\+\)\.WebAssembly *= *\([a-z]\+\)()/\1.WebAssembly=\1.WebAssembly||\2()/' wasm-polyfill.js

watch:
	node_modules/.bin/rollup -c -w

webextension/wasm-polyfill.js: wasm-polyfill.js
	cp wasm-polyfill.js webextension/wasm-polyfill.js

.PHONY: webextension
webextension: webextension/wasm-polyfill.js

spec/interpreter/README.md:
	git submodule update --init

spec/interpreter/wasm: spec/interpreter/README.md .git/modules/spec/*
	cd spec/interpreter && make

test: wasm-polyfill.js spec/interpreter/wasm
	node_modules/.bin/mocha --timeout 10000 tests

test-bail: wasm-polyfill.js spec/interpreter/wasm
	node_modules/.bin/mocha --timeout 10000 --bail tests
