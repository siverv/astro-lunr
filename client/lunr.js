import lunr from 'lunr';


function joinPath(...path){
	return path.filter(Boolean).join("/").replace(/\/+/g, "/");
}

export default function initializeLunr({lunrDir}){
	let idxMap = new Map();
	async function getIndex(index = ""){
		if(!idxMap.has(index)){
			let response = await fetch(joinPath(lunrDir, index, "idx.json"));
			if(response.status !== 200){
				throw new Error(`Astro-lunr: idx.json not found for index=${index}`);
			}
			let idxJson = await response.text();
			idxMap.set(index, lunr.Index.load(JSON.parse(idxJson)));
		}
		return idxMap.get(index);
	}

	let docMap = new Map();
	async function getDocs(index = ""){
		if(!docMap.has(index)){
			let response = await fetch(joinPath(lunrDir, index, "docs.json"));
			if(response.status !== 200){
				throw new Error(`Astro-lunr: docs.json not found for index=${index}`);
			}
			let docsJson = await response.text();
			docMap.set(index, JSON.parse(docsJson).reduce((map, doc) => map.set(doc.id, doc), new Map()));
		}
		return docMap.get(index);
	}

	async function search(query, index) {
		if(!query) {
			return [];
		}
		let idx = await getIndex(index);
		return idx.search(query);
	}

	async function enrich(hits, index){
		const docs = await getDocs(index)
		return hits.map(hit => {
			return {
				doc: docs.get(hit.ref),
				hit
			}
		})
	}
	
	return {
		getIndex,
		getDocs,
		search,
		enrich,
	}
}