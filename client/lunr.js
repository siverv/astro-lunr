import lunr from 'lunr';

const LUNR_DIR = import.meta.env.PUBLIC_LUNR_DIR || "";
const BASE_URL = import.meta.env.PUBLIC_BASE_URL || "/";

function join(...path){
	return path.filter(Boolean).join("/").replace(/\/+/g, "/");
}

let idxMap = new Map();
export async function getIndex(index = ""){
	if(!idxMap.has(index)){
		let response = await fetch(join(BASE_URL, LUNR_DIR, index, "idx.json"));
		if(response.status !== 200){
			throw new Error(`Astro-lunr: idx.json not found for index=${index}`);
		}
		let idxJson = await response.text();
		idxMap.set(index, lunr.Index.load(JSON.parse(idxJson)));
	}
	return idxMap.get(index);
}

let docMap = new Map();
export async function getDocs(index = ""){
	if(!docMap.has(index)){
		let response = await fetch(join(BASE_URL, LUNR_DIR, index, "docs.json"));
		if(response.status !== 200){
			throw new Error(`Astro-lunr: docs.json not found for index=${index}`);
		}
		let docsJson = await response.text();
		docMap.set(index, JSON.parse(docsJson).reduce((map, doc) => map.set(doc.id, doc), new Map()));
	}
	return docMap.get(index);
}

export async function search(query, index) {
	if(!query) {
		return [];
	}
	let idx = await getIndex(index);
	return idx.search(query);
}

export async function enrich(hits, index){
	const docs = await getDocs(index)
	return hits.map(hit => {
		return {
			doc: docs.get(hit.ref),
			hit
		}
	})
}