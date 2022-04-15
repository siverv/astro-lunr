import { createFilter } from '@rollup/pluginutils'
import fs from 'node:fs';
import path from 'node:path';
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

function indexLunrDocuments(canonicalUrl, addToBulk){
	return () => traverseReplace.bind(null, (node) => {
        if(node.type === "element" && node.tagName === "lunr-document"){
        	let doc = parseLunrDocument(node);
        	doc["canonicalUrl"] = canonicalUrl;
        	doc["__index__"] = node.properties.index;
        	addToBulk(doc);
        	return []
        }
    });
}


// function getViteConfiguration(options = {}) {
// 	var filter = createFilter(["**/pages/**/*.astro"], options.exclude, {});
// 	return {	
// 		plugins: [
// 			{
// 				enforce: 'pre', // run transforms before other plugins can
// 				name: "lunr-rollup-plugin",
// 				transform(code, id) {
// 					if(!filter(id)) return null;
// 					const ast = this.parse(code);
// 					const ext = ast.body.filter(node => node.type === "ExportNamedDeclaration");
// 					const indexDocumentAst = ext.find(node => node.declaration.declarations.find(n => n.id === "indexDocument"))
// 					if(!indexDocumentAst) return null;
// 					console.log("transform", id, indexDocumentAst);
// 					// const art = this.parse(code);
// 					// const source = await fs.promises.readFile(id, 'utf8').catch(err => console.log(err));
// 					// console.log("loaded", id, source);
// 				}
// 			}
// 		],
// 	};
// }


export default function createPlugin({pathFilter, subDir, documentFilter, initialize, mapDocument, verbose}){
	let config = {};
	let pathsToIndex = []
	return {
		name: 'lunr-filenames',
		hooks: {
			'astro:config:setup': (options) => {
				if(options.command === "dev"){
					options.addRenderer({
						name: 'lunr-renderer',
						serverEntrypoint: '@integrations/astro-lunr/server/renderer.js',
					});
				}
			},
			'astro:build:done': async ({pages, dir}) => {
				let indexMap = new Map();
				const addToIndexMap = (doc) => {
					if(documentFilter && !documentFilter(doc)){
						return;
					}
					const {__index__: index, ...rest} = doc;
					if(!indexMap.has(index)){
						indexMap.set(index, []);
					}
					indexMap.get(index).push({
						...rest,
						id: doc["id"] || crypto.createHash('md5').update(doc["canonicalUrl"]).digest('hex')
					});
				}
				let documents = [];
				for(let {pathname} of pages) {
					if(pathFilter && !pathFilter(pathname)){
						continue;
					}
					let url = new URL((pathname ? pathname + "/" : "") + "index.html", dir);
					let content = fs.readFileSync(url, "utf-8");
					let newDocuments = [];
					let hyped = await rehype()
						.use(indexLunrDocuments(pathname, (doc) => newDocuments.push(doc)))
						.process(content);
					if(newDocuments.length > 0) {
						if(verbose){
							console.log(`Indexing ${pathname}, found ${newDocuments.length} documents to index`);
						}
						fs.writeFileSync(url, String(hyped));
						newDocuments.forEach(addToIndexMap)
					}
				}
				for(let [index, documents] of indexMap){
					const idx = lunr(function () {
						initialize(this, lunr);
						documents.forEach(doc => this.add(doc));
					})
					if(mapDocument){
						documents = documents.map(mapDocument);
					}
					fs.writeFileSync(new URL(path.join(subDir || "", index || "", 'idx.json'), dir), JSON.stringify(idx));
					fs.writeFileSync(new URL(path.join(subDir || "", index || "", 'docs.json'), dir), JSON.stringify(documents));
				}
			}
		}
	}
}