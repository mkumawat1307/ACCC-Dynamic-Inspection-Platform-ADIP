export function buildWatermarkPage(imageBase64: string, lines: string[], photoId: number): string {
  const safeB64 = JSON.stringify(imageBase64).slice(1, -1);
  const sanitized = lines.map(l => l.replace(/[<>&"']/g, "").replace(/<\/?script>/gi, "").replace(/\\/g, "\\\\").replace(/`/g, ""));
  const safeLines = JSON.stringify(sanitized);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff}
canvas{display:block}
</style>
</head>
<body>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv');
var ctx=cv.getContext('2d');
var img=new Image();
img.onload=function(){
  cv.width=img.naturalWidth;
  cv.height=img.naturalHeight;
  ctx.drawImage(img,0,0);

  var baseSize=Math.min(img.naturalWidth,img.naturalHeight);
  var fSize=Math.max(40,Math.round(baseSize/35));
  var lh=Math.round(fSize*1.4),padY=Math.round(fSize*0.5),rPad=Math.round(fSize*0.6),gap=Math.round(fSize*0.7);
  var lines=${safeLines};
  ctx.font='bold '+fSize+'px monospace';
  var mw=0;
  for(var i=0;i<lines.length;i++){
    var m=ctx.measureText(lines[i]);
    if(m.width>mw)mw=m.width;
  }

  var rw=mw+rPad*2,rh=lines.length*lh+padY*2;
  var rx=gap,ry=cv.height-rh-gap;

  ctx.fillStyle='rgba(0,0,0,0.6)';
  roundRect(ctx,rx,ry,rw,rh,10);
  ctx.fill();

  ctx.fillStyle='#76FF03';
  ctx.font='bold '+fSize+'px monospace';
  for(var i=0;i<lines.length;i++){
    ctx.fillText(lines[i],rx+rPad,ry+padY+i*lh+fSize-4);
  }

  cv.toBlob(function(blob){
    var fr=new FileReader();
    fr.onload=function(){
      var raw=fr.result.split(',')[1];
      window.ReactNativeWebView.postMessage(JSON.stringify({photoId:${photoId},base64:raw}));
    };
    fr.readAsDataURL(blob);
  },'image/jpeg',0.95);
};
img.src='data:image/jpeg;base64,${safeB64}';

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
</script>
</body>
</html>`;
}
