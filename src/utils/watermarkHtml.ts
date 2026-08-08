import { WatermarkStyleConfig, WatermarkOverlayLayout } from "@/src/utils/watermarkStyle";

export function sanitizeWatermarkLines(lines: string[]): string[] {
  return lines.map(l =>
    l
      .replace(/[<>&"']/g, "")
      .replace(/<\/?script>/gi, "")
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "")
  );
}

export function buildRenderWatermarkScript(
  photoId: number,
  imageBase64: string,
  lines: string[],
  style?: WatermarkStyleConfig,
  nativeEncode = false
): string {
  const payload = JSON.stringify({
    photoId,
    base64: imageBase64,
    lines: sanitizeWatermarkLines(lines),
    ...(style ? { style } : {}),
    ...(nativeEncode ? { nativeEncode: true } : {}),
  })
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `window.renderWatermarkFromJson(${payload}); true;`;
}

export function buildMeasureOverlayScript(
  photoId: number,
  fontSize: number,
  lines: string[]
): string {
  const payload = JSON.stringify({
    photoId,
    measure: true,
    fontSize,
    lines: sanitizeWatermarkLines(lines),
  })
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `window.renderWatermarkFromJson(${payload}); true;`;
}

export function buildRenderOverlayScript(
  photoId: number,
  layout: WatermarkOverlayLayout,
  lines: string[],
  style?: WatermarkStyleConfig
): string {
  const payload = JSON.stringify({
    photoId,
    layout,
    lines: sanitizeWatermarkLines(lines),
    ...(style ? { style } : {}),
  })
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `window.renderWatermarkFromJson(${payload}); true;`;
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
var ctx=cv.getContext('2d',{willReadFrequently:true});
var img=new Image();
var diagJobs=0;
var diagCaptures=0;
var diagGcCount=0,diagGcMs=0;
try{if(typeof PerformanceObserver!=='undefined'){var gcObs=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){diagGcCount++;if(typeof e.duration==='number')diagGcMs+=e.duration;});});gcObs.observe({entryTypes:['gc']});}}catch(e){}
var diagInstance=Math.random().toString(36).slice(2,10);
var diagCreatedAt=Date.now();
window.addEventListener('pagehide',function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({__unload:true,instance:diagInstance,created:diagCreatedAt,uptime:Math.round(performance.now())}));}catch(e){}});
window.addEventListener('beforeunload',function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({__unload:true,instance:diagInstance,created:diagCreatedAt,uptime:Math.round(performance.now())}));}catch(e){}});
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
function fileReaderBase64(blob,cb){
  var fr=new FileReader();
  fr.onload=function(){cb(fr.result.split(',')[1]||'');};
  fr.readAsDataURL(blob);
}
function arrayBufferToBase64(buf){
  var bytes=new Uint8Array(buf);
  var CHUNK=0x8000,chunks=[],i,j,bin;
  for(i=0;i<bytes.length;i+=CHUNK){
    var sub=bytes.subarray(i,i+CHUNK);
    bin='';
    for(j=0;j<sub.length;j++)bin+=String.fromCharCode(sub[j]);
    chunks.push(btoa(bin));
  }
  return chunks.join('');
}
function measureOverlayText(photoId,fontSize,lines){
  ctx.font='bold '+fontSize+'px sans-serif';
  var mw=0;
  for(var i=0;i<lines.length;i++){
    var m=ctx.measureText(lines[i]);
    if(m.width>mw)mw=m.width;
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({
    photoId:photoId,
    maxTextWidth:Math.ceil(mw)
  }));
}
function renderOverlay(photoId,layout,lines,style){
  diagJobs++;
  diagCaptures++;
  if(!style)style={fontScale:0.8,position:'bottomLeft',bgOpacity:0.5,textColor:'#76FF03'};
  var t0=performance.now();
  var W=layout.overW,H=layout.overH;
  var cvPrevW=cv.width,cvPrevH=cv.height;
  cv.width=W;
  cv.height=H;
  var m=layout.metrics;
  var dx=layout.boxX-layout.overX,dy=layout.boxY-layout.overY;
  var tDraw0=performance.now();
  ctx.shadowColor='rgba(0,0,0,0.35)';
  ctx.shadowBlur=8;
  ctx.shadowOffsetY=2;
  ctx.fillStyle='rgba(0,0,0,'+style.bgOpacity+')';
  roundRect(ctx,dx,dy,layout.boxW,layout.boxH,m.corner);
  ctx.fill();
  ctx.shadowBlur=0;
  ctx.shadowOffsetX=0;
  ctx.shadowOffsetY=0;
  ctx.fillStyle=style.textColor;
  ctx.font='bold '+m.fSize+'px sans-serif';
  ctx.shadowColor='rgba(0,0,0,0.9)';
  ctx.shadowBlur=2;
  ctx.shadowOffsetX=1;
  ctx.shadowOffsetY=1;
  var tx=layout.textLeft-layout.overX,ty=layout.textBase-layout.overY;
  for(var i=0;i<lines.length;i++){
    ctx.fillText(lines[i],tx,ty+i*m.lh);
  }
  ctx.shadowBlur=0;
  ctx.shadowOffsetX=0;
  ctx.shadowOffsetY=0;
  var tDraw=performance.now();
  var tBlobStart=performance.now();
  cv.toBlob(function(blob){
    var tBlobCb=performance.now();
    var tFrStart=performance.now();
    fileReaderBase64(blob,function(raw){
      var tFrEnd=performance.now();
      var diag={
        instance:diagInstance,
        created:diagCreatedAt,
        capture:diagCaptures,
        jobs:diagJobs,
        uptimeMs:Math.round(tBlobCb),
        t1AtMs:Math.round(tBlobStart),
        cbAtMs:Math.round(tBlobCb),
        imgWasSized:true,
        imgW:0,
        imgH:0,
        cvPrevW:cvPrevW,
        cvPrevH:cvPrevH,
        cvW:W,
        cvH:H,
        canvasReset:(cvPrevW!==W||cvPrevH!==H),
        overlayPngB64Len:raw.length,
        overlayX:layout.overX,
        overlayY:layout.overY,
        overlayW:layout.overW,
        overlayH:layout.overH,
        boxX:layout.boxX,
        boxY:layout.boxY,
        boxW:layout.boxW,
        boxH:layout.boxH,
        shadowMargin:(layout.overX-layout.boxX)>=0?(layout.overX-layout.boxX):0,
        toBlobMs:Math.round(tBlobCb-tBlobStart),
        frMs:Math.round(tFrEnd-tFrStart),
        quality:0.95,
        native:true
      };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        photoId:photoId,
        overlay:raw,
        overlayX:layout.overX,
        overlayY:layout.overY,
        overlayWidth:layout.overW,
        overlayHeight:layout.overH,
        perf:{decode:0,draw:Math.round(tDraw-t0),encode:Math.round(tFrEnd-t0),total:Math.round(tFrEnd-t0)},
        diag:diag
      }));
      diagJobs--;
    });
  },'image/png');
}
function renderWatermark(photoId,imageBase64,lines,style,nativeEncode){
  diagJobs++;
  diagCaptures++;
  if(!style)style={fontScale:0.8,position:'bottomLeft',bgOpacity:0.5,textColor:'#76FF03'};
  var t0=performance.now();
  var tSet=performance.now();
  var imgWasResident=img.complete&&img.naturalWidth>0;
  img.onload=function(){
    var tDecode=performance.now();
    var cvPrevW=cv.width,cvPrevH=cv.height;
    cv.width=img.naturalWidth;
    cv.height=img.naturalHeight;
    ctx.drawImage(img,0,0);

    var baseSize=Math.min(img.naturalWidth,img.naturalHeight);
    var fSize=Math.max(22,Math.round(baseSize/18*style.fontScale));
    var lh=Math.round(fSize*1.15),padY=Math.round(fSize*0.35),rPad=Math.round(fSize*0.4),gapX=Math.max(16,Math.round(fSize*0.75)),gapY=Math.max(20,Math.round(fSize*1.0));
    var corner=Math.max(4,Math.round(fSize*0.2));
    ctx.font='bold '+fSize+'px sans-serif';
    var mw=0;
    for(var i=0;i<lines.length;i++){
      var m=ctx.measureText(lines[i]);
      if(m.width>mw)mw=m.width;
    }

    var rw=mw+rPad*2,rh=lines.length*lh+padY*2;
    var rx=gapX,ry=cv.height-rh-gapY;
    if(style.position==='bottomRight'){rx=cv.width-rw-gapX;}else{rx=gapX;}

    ctx.shadowColor='rgba(0,0,0,0.35)';
    ctx.shadowBlur=8;
    ctx.shadowOffsetY=2;
    ctx.fillStyle='rgba(0,0,0,'+style.bgOpacity+')';
    roundRect(ctx,rx,ry,rw,rh,corner);
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.shadowOffsetX=0;
    ctx.shadowOffsetY=0;

    ctx.fillStyle=style.textColor;
    ctx.font='bold '+fSize+'px sans-serif';
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
    var heapBefore=performance.memory?performance.memory.usedJSHeapSize:0;
    var gcBefore=diagGcCount,gcDurBefore=diagGcMs;
    if(nativeEncode){
      var tGetStart=performance.now();
      var imgData=ctx.getImageData(0,0,cv.width,cv.height);
      var tGetEnd=performance.now();
      var rgba=arrayBufferToBase64(imgData.data.buffer);
      var tB64End=performance.now();
      var diag={
        instance:diagInstance,
        created:diagCreatedAt,
        capture:diagCaptures,
        jobs:diagJobs,
        uptimeMs:Math.round(tB64End),
        getDataAtMs:Math.round(tGetStart),
        cbAtMs:Math.round(tB64End),
        heapBefore:heapBefore,
        heapAfter:performance.memory?performance.memory.usedJSHeapSize:0,
        gcEvents:diagGcCount-gcBefore,
        gcMs:Math.round(diagGcMs-gcDurBefore),
        imgWasResident:imgWasResident,
        imgW:img.naturalWidth,
        imgH:img.naturalHeight,
        cvPrevW:cvPrevW,
        cvPrevH:cvPrevH,
        cvW:cv.width,
        cvH:cv.height,
        canvasReset:(cvPrevW!==cv.width||cvPrevH!==cv.height),
        rgbaLen:rgba.length,
        quality:0.95,
        getDataStart:Math.round(tGetStart-tSet),
        getDataCb:Math.round(tB64End-tSet),
        getDataMs:Math.round(tGetEnd-tGetStart),
        b64Ms:Math.round(tB64End-tGetEnd),
        native:true
      };
      if(performance.memory){diag.heapUsed=performance.memory.usedJSHeapSize;diag.heapLimit=performance.memory.jsHeapSizeLimit;}
      window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,width:cv.width,height:cv.height,rgba:rgba,perf:{decode:Math.round(tDecode-tSet),draw:Math.round(tDraw-tDecode),encode:Math.round(tB64End-tDraw),total:Math.round(tB64End-t0)},diag:diag}));
      img.onload=null;
      img.src='';
      diagJobs--;
      return;
    }
    var tBlobStart=performance.now();
    cv.toBlob(function(blob){
      var tBlobCb=performance.now();
      var tFrStart=performance.now();
      fileReaderBase64(blob,function(raw){
        var tFrEnd=performance.now();
        var tEncode=tFrEnd;
        var diag={
          instance:diagInstance,
          created:diagCreatedAt,
          capture:diagCaptures,
          jobs:diagJobs,
          uptimeMs:Math.round(tBlobCb),
          toBlobAtMs:Math.round(tBlobStart),
          cbAtMs:Math.round(tBlobCb),
          heapBefore:heapBefore,
          heapAfter:performance.memory?performance.memory.usedJSHeapSize:0,
          gcEvents:diagGcCount-gcBefore,
          gcMs:Math.round(diagGcMs-gcDurBefore),
          imgWasResident:imgWasResident,
          imgW:img.naturalWidth,
          imgH:img.naturalHeight,
          cvPrevW:cvPrevW,
          cvPrevH:cvPrevH,
          cvW:cv.width,
          cvH:cv.height,
          canvasReset:(cvPrevW!==cv.width||cvPrevH!==cv.height),
          blobSize:blob.size,
          b64Len:raw.length,
          quality:0.95,
          toBlobStart:Math.round(tBlobStart-tSet),
          toBlobCb:Math.round(tBlobCb-tSet),
          frStart:Math.round(tFrStart-tSet),
          frEnd:Math.round(tFrEnd-tSet),
          toBlobMs:Math.round(tBlobCb-tBlobStart),
          frMs:Math.round(tFrEnd-tFrStart)
        };
        if(performance.memory){diag.heapUsed=performance.memory.usedJSHeapSize;diag.heapLimit=performance.memory.jsHeapSizeLimit;}
        window.ReactNativeWebView.postMessage(JSON.stringify({photoId:photoId,base64:raw,perf:{decode:Math.round(tDecode-tSet),draw:Math.round(tDraw-tDecode),encode:Math.round(tEncode-tDraw),total:Math.round(tEncode-t0)},diag:diag}));
        img.onload=null;
        img.src='';
        diagJobs--;
      });
    },'image/jpeg',0.95);
  };
  img.src='data:image/jpeg;base64,'+imageBase64;
}
window.renderWatermarkFromJson=function(payload){
  if(payload&&payload.photoId!=null&&payload.measure&&payload.fontSize)measureOverlayText(payload.photoId,payload.fontSize,payload.lines||[]);
  else if(payload&&payload.photoId!=null&&payload.layout)renderOverlay(payload.photoId,payload.layout,payload.lines||[],payload.style||{});
  else if(payload&&payload.photoId!=null&&payload.base64)renderWatermark(payload.photoId,payload.base64,payload.lines||[],payload.style||{},payload.nativeEncode===true);
};
window.ReactNativeWebView.postMessage(JSON.stringify({__ready:true,instance:diagInstance,created:diagCreatedAt}));
</script>
</body>
</html>`;
}