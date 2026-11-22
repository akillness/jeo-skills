export function installViewer({camera,controls,views,setView,invalidate}){
 function apply(name){const view=views[name];if(!view)return false;if(setView)setView(name);else{camera.position.set(...view.position);controls.target.set(...view.target);controls.update();}invalidate?.();return true;}
 window.__viewer={views:Object.keys(views),setView:apply};
 return{markReady(){window.__sceneReady=true;}};
}
