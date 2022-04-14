import { createFilter } from '@rollup/pluginutils'
import fs from 'node:fs';
import {rehype} from 'rehype'
import lunr from 'lunr';
import crypto from 'node:crypto';

function traverseReplace(replace, tree) {
    return transform(tree, null, null);
    function transform(node, index, parent) {
        let replacement = replace(node, index, parent);
        if(replacement){
            return replacement;
        } else {
            if ('children' in node) {
                return {
                    ...node,
                    children: node.children.flatMap(
                        (child, index) => transform(child, index, node)
                    )
                };
            } return node;
        }
    }
}

function parseLunrDocument(lunrTree){
	let doc = {};
	traverseReplace((node => {
		if(node.type === "element"){
			switch(node.tagName){
				case "lunr-field": {
					doc[node.properties.name] = node.properties.value;
					break;
				}
				case "lunr-text": {
					doc[node.properties.name] = node.children.filter(n => n.type === "text").map(n => n.value).join("\n");
					break;
				}
			}
		}
	}), lunrTree)
	return doc;
}

function indexLunrElements(canonicalUrl, addToBulk){
	return () => traverseReplace.bind(null, (node) => {
        if(node.type === "element" && node.tagName === "lunr-document"){
        	let doc = parseLunrDocument(node);
        	doc["canonicalUrl"] = canonicalUrl;
        	addToBulk(doc);
        	return []
        }
    });
}


function getViteConfiguration(options = {}) {
	var filter = createFilter(["**/pages/**/*.astro"], options.exclude, {});
	return {	
		plugins: [
			{
				enforce: 'pre', // run transforms before other plugins can
				name: "lunr-rollup-plugin",
			    // buildEnd() {
			    // 	console.log("build end", this.getModuleIds);
			    //   // do something with this list
			    // },
				// async resolveId(id, importer, options) {
				// 	if(id === "/tree/master/src") console.log("res", id, importer, options)
				// 	return undefined;
				// },
				transform(code, id) {
					if(!filter(id)) return null;
					const ast = this.parse(code);
					const ext = ast.body.filter(node => node.type === "ExportNamedDeclaration");
					const indexDocumentAst = ext.find(node => node.declaration.declarations.find(n => n.id === "indexDocument"))
					if(!indexDocumentAst) return null;
					console.log("transform", id, indexDocumentAst);
					// const art = this.parse(code);
					// const source = await fs.promises.readFile(id, 'utf8').catch(err => console.log(err));
					// console.log("loaded", id, source);
				}
			}
		],
	};
}


export default function createPlugin({pathFilter, documentFilter}){
	let config = {};
	let pathsToIndex = []
	console.log("create plugin for lunr")
	return {
		name: 'lunr-filenames',
		hooks: {
			'astro:config:setup': (options) => {
				if(options.command === "dev"){
					options.addRenderer({
						name: 'lunr-renderer',
						serverEntrypoint: '@integrations/astro-lunr/renderer.js',
					});
				}
			},
			'astro:config:done': (options) => {
				console.log("config:done")
			},
			'astro:server:start': (options) => {
				console.log("astro:server:start", options);
			},
			'astro:build:start': (options) => {
				console.log("astro:build:start", options);
			},
			'astro:build:done': async ({pages, routes, dir}) => {
				console.log("build:done", pages[0], routes, JSON.stringify(routes[0].segments));
				let documents = [];
				for(let {pathname} of pages) {
					if(pathFilter && !pathFilter(pathname)){
						continue;
					}
					let url = new URL((pathname ? pathname + "/" : "") + "index.html", dir);
					let content = fs.readFileSync(url, "utf-8");
					console.log(pathname, content.length);
					let newDocuments = [];
					let hyped = await rehype()
						.use(indexLunrElements(pathname, (doc) => newDocuments.push(doc)))
						.process(content);
					if(newDocuments.length > 0) {
						fs.writeFileSync(url, String(hyped));
						documents.push(...newDocuments);
					}
				}
				documents = documents.map(doc => ({...doc, id: crypto.createHash('md5').update(doc["canonicalUrl"]).digest('hex')}))
				
				if(documentFilter){
					documents = documents.filter(documentFilter);
				}

				lunr.tokenizer.separator = /[^\w]+/
				const idx = lunr(function () {
					this.use(builder => {
						builder.pipeline.reset();
						builder.searchPipeline.reset();
					})
					this.field("canonicalUrl", {boost: 0.01});
					this.field("ref", {boost: 0.01});
					this.field("oid", {boost: 0.01});
					this.field("path", {boost: 0.1});
					this.field("name", {boost: 10});
					this.field("content");
  					this.metadataWhitelist = ['position'];
					documents.forEach(doc => this.add(doc));
				})
				const simplifiedDocuments = documents.map(doc => {
					let {content, summary, ...simple} = doc;
					return doc;
				})
				fs.writeFileSync(new URL('lunr-index.json', dir), JSON.stringify(idx));
				fs.writeFileSync(new URL('lunr-docs.json', dir), JSON.stringify(simplifiedDocuments));
			}
		}
	}
}