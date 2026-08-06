export function sanitizeWatermarkLines(lines: string[]): string[] {
  return lines.map(l =>
    l
      .replace(/[<>&"']/g, "")
      .replace(/<\/?script>/gi, "")
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "")
  );
}

export function buildWatermarkMessage(
  photoId: number,
  imageBase64: string,
  lines: string[]
): string {
  return JSON.stringify({
    photoId,
    base64: imageBase64,
    lines: sanitizeWatermarkLines(lines),
  });
}

export function buildWatermarkRendererPage(): string {
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
function renderWatermark(photoId,imageBase64,lines){
  var t0=performance.now();
  var tSet=performance.now();
  img.onload=function(){
    var tDecode=performance.now();
    cv.width=img.naturalWidth;
    cv.height=img.naturalHeight;
    ctx.drawImage(img,0,0);

    var baseSize=Math.min(img.naturalWidth,img.naturalHeight);
    var fSize=Math.max(22,Math.round(baseSize/18));
    var lh=Math.round(fSize*1.15),padY=Math.round(fSize*0.35),rPad=Math.round(fSize*0.4),gapX=Math.max(16,Math.round(fSize*0.75)),gapY=Math.max(20,Math.round(fSize*1.0));
    ctx.font='bold '+fSize+'px monospace';
    var mw=0;
    for(var i=0;i<lines.length;i++){
      var m=ctx.measureText(lines[i]);
      if(m.width>mw)mw=m.width;
    }

    var rw=mw+rPad*2,rh=lines.length*lh+padY*2;
    var rx=gapX,ry=cv.height-rh-gapY;

    ctx.fillStyle='rgba(0,0,0,0.5)';
    roundRect(ctx,rx,ry,rw,rh,8);
    ctx.fill();

    ctx.fillStyle='#76FF03';
    ctx.font='bold '+fSize+'px monospace';
    ctx.shadowColor='rgba(0,0,0,0.9)';
    ctx.shadowBlur=2;
    ctx.shadowOffsetX=1;
    ctx.shadowOffsetY=1;
    for(var i=0;i<lines.length;i++){
      ctx.fillText(lines[i],rx+rPad,ry+padY+i*lh+Math.round(fSize*0.8));
    }
    ctx.shadowBlur=0;
    ctx.shadowOffsetX=0;
    ctx.shadowOffsetY=0;

    var tDraw=performance.now();
    cv.toBlob(function(blob){
      var fr=new FileReader();
      fr.onload=function(){
        var raw=fr.result.split(',')[1];
        var tEncode=performance.now();
        window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,base64:raw,perf:{decode:Math.round(tDecode-tSet),draw:Math.round(tDraw-tDecode),encode:Math.round(tEncode-tDraw),total:Math.round(tEncode-t0)}}));
        img.onload=null;
        img.src='';
      };
      fr.readAsDataURL(blob);
    },'image/jpeg',0.95);
  };
  img.src='data:image/jpeg;base64,'+imageBase64;
}
document.addEventListener('message',function(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.photoId!=null&&msg.base64)renderWatermark(msg.photoId,msg.base64,msg.lines||[]);
  }catch(err){}
});
window.ReactNativeWebView.postMessage(JSON.stringify({__ready:true}));
</script>
</body>
</html>`;
}
