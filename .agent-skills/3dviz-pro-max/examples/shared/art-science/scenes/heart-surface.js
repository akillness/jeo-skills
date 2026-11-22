import {THREE} from '../scene-kit.js';
// Clip distant pulmonary branches and retain the connected proximal component. Keeping only a
// draw-time clip plane would leave disconnected islands where remote branches re-enter the box.
export function proximalPulmonary(geometry){
 const p=geometry.attributes.position,index=geometry.index.array,parent=Int32Array.from({length:p.count},(_,i)=>i),faces=[];
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const inside=i=>p.getX(i)>-1.3&&p.getX(i)<1.35&&p.getY(i)>-.1&&p.getY(i)<1.7&&p.getZ(i)>-.48;
 for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2];if(!inside(a)||!inside(b)||!inside(c))continue;parent[root(a)]=root(b);parent[root(c)]=root(b);faces.push(a,b,c);}
 const counts=new Map();for(let i=0;i<faces.length;i+=3){const r=root(faces[i]);counts.set(r,(counts.get(r)||0)+1);}
 let largest=-1,n=0;for(const [r,count] of counts)if(count>n){largest=r;n=count;}
 const kept=[];for(let i=0;i<faces.length;i+=3)if(root(faces[i])===largest)kept.push(faces[i],faces[i+1],faces[i+2]);
 if(!kept.length)throw new Error('Pulmonary surface crop produced no connected component');
 geometry.setIndex(kept);geometry.computeVertexNormals();return geometry;
}
