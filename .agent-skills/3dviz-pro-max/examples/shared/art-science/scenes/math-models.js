const TAU=2*Math.PI;
export const mul3=(a,v)=>[a[0]*v[0]+a[1]*v[1]+a[2]*v[2],a[3]*v[0]+a[4]*v[1]+a[5]*v[2],a[6]*v[0]+a[7]*v[1]+a[8]*v[2]];
export const mm3=(a,b)=>Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c]});
export const tr3=a=>[a[0],a[3],a[6],a[1],a[4],a[7],a[2],a[5],a[8]];
export const rz=a=>[Math.cos(a),-Math.sin(a),0,Math.sin(a),Math.cos(a),0,0,0,1];
export const ry=a=>[Math.cos(a),0,Math.sin(a),0,1,0,-Math.sin(a),0,Math.cos(a)];
export function svdMatrix(s=[1.7,1,.45],u=.65,v=-.5){return mm3(mm3(rz(u),[s[0],0,0,0,s[1],0,0,0,s[2]]),tr3(ry(v)));}
export function svdPoint(p,stage,s=[1.7,1,.45],u=.65,v=-.5){let q=mul3(ry(-v*Math.min(stage,1)),p);if(stage>1)q=q.map((x,i)=>x*(1+(s[i]-1)*Math.min(stage-1,1)));if(stage>2)q=mul3(rz(u*Math.min(stage-2,1)),q);return q;}

export function fourierTerms(n,t){return Array.from({length:n},(_,k)=>{const h=2*k+1,a=4/(Math.PI*h);return [a*Math.cos(h*t),a*Math.sin(h*t)]});}
export function fourierValue(n,t){return fourierTerms(n,t).reduce((s,p)=>s+p[1],0);}
export function phasorChain(n,t){const out=[[0,0]];for(const [x,y] of fourierTerms(n,t)){const p=out.at(-1);out.push([p[0]+x,p[1]+y]);}return out;}

export function mobius(t,s=.42,R=1.35){return [(R+s*Math.cos(t/2))*Math.cos(t),(R+s*Math.cos(t/2))*Math.sin(t),s*Math.sin(t/2)];}
export function mobiusNormal(t,s=.3){const e=1e-5,a=mobius(t+e,s),b=mobius(t-e,s),c=mobius(t,s+e),d=mobius(t,s-e);const u=a.map((x,i)=>x-b[i]),v=c.map((x,i)=>x-d[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);return n.map(x=>x/l);}
export const torus=(u,v,R=1.25,r=.48)=>[(R+r*Math.cos(v))*Math.cos(u),(R+r*Math.cos(v))*Math.sin(u),r*Math.sin(v)];
export const trefoil=t=>[1.15*Math.sin(t)+.55*Math.sin(2*t),1.15*Math.cos(t)-.55*Math.cos(2*t),.55*Math.sin(3*t)];

export function sphereFromComplex(x,y){const d=x*x+y*y+1;return [2*x/d,2*y/d,(x*x+y*y-1)/d];}
export function complexFromSphere([X,Y,Z]){if(1-Z<1e-12)return {infinity:true};return {x:X/(1-Z),y:Y/(1-Z),infinity:false};}
export function reciprocal(x,y){const d=x*x+y*y;if(d<1e-12)return {infinity:true};return {x:x/d,y:-y/d,infinity:false};}

export function covariance(sx,sy,sz,rho){return [[sx*sx,rho*sx*sy,0],[rho*sx*sy,sy*sy,0],[0,0,sz*sz]];}
export function cholesky(sx,sy,sz,rho){return [[sx,0,0],[rho*sy,sy*Math.sqrt(1-rho*rho),0],[0,0,sz]];}
export function rng(seed){let x=seed>>>0;return()=>((x=(1664525*x+1013904223)>>>0)/4294967296);}
export function gaussianSamples(n,seed,sx,sy,sz,rho){const r=rng(seed),L=cholesky(sx,sy,sz,rho),out=[];while(out.length<n){const a=Math.sqrt(-2*Math.log(Math.max(r(),1e-12))),q=TAU*r(),z=[a*Math.cos(q),a*Math.sin(q),Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(TAU*r())];out.push([L[0][0]*z[0],L[1][0]*z[0]+L[1][1]*z[1],L[2][2]*z[2]]);}return out;}
export function sampleCovariance(xs){const n=xs.length,m=[0,1,2].map(j=>xs.reduce((s,x)=>s+x[j],0)/n);return [0,1,2].map(i=>[0,1,2].map(j=>xs.reduce((s,x)=>s+(x[i]-m[i])*(x[j]-m[j]),0)/(n-1)));}
export function covarianceAxes(sx,sy,sz,rho){const a=sx*sx,b=rho*sx*sy,d=sy*sy,ang=.5*Math.atan2(2*b,a-d),disc=Math.hypot(a-d,2*b);return [{v:[Math.cos(ang),Math.sin(ang),0],l:Math.sqrt((a+d+disc)/2)},{v:[-Math.sin(ang),Math.cos(ang),0],l:Math.sqrt((a+d-disc)/2)},{v:[0,0,1],l:sz}];}
