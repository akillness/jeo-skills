export const REST_LENGTH=3.9,THIN_LENGTH=1.35,THICK_LENGTH=2.05;
export function sarcomereState(shortening){
 const fraction=Math.max(0,Math.min(.25,shortening)),length=REST_LENGTH*(1-fraction),half=length/2;
 return {fraction,length,half,leftTip:-half+THIN_LENGTH,rightTip:half-THIN_LENGTH,
  aBand:THICK_LENGTH,iHalf:half-THICK_LENGTH/2,hZone:Math.max(0,length-2*THIN_LENGTH)};
}
