
function check(Component, ...args){
	return Component.startsWith("lunr-document");
}

function renderToStaticMarkup(){
	return {html: " "}
}

export default {
	check,
	renderToStaticMarkup,
};