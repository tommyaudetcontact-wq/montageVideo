const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),controls={
 'export-mode':{value:'mobile'},'export-fps':{value:'60',disabled:false,dataset:{}},'export-mode-hint':{textContent:''}
};
const sourceOption={textContent:''},ctx={document:{addEventListener(){},getElementById:id=>controls[id],querySelector:()=>sourceOption}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'export.js'),'utf8'),ctx);
const settings=options=>ctx.resolveExportSettings({sourceWidth:2160,sourceHeight:3840,ratio:9/16,resolution:'720',fps:60,...options});
const hd=settings();assert.equal(hd.width,720);assert.equal(hd.height,1280);assert.equal(hd.fps,30);assert.equal(hd.bitrate,7000000);assert.equal(hd.encoder.fullCodecString,'avc1.42e01f');assert.equal(hd.encoder.latencyMode,'realtime');assert.equal(hd.keyframeFrames,10);
const full=settings({resolution:'1080'});assert.equal(full.height,1920);assert.equal(full.bitrate,10000000);assert.equal(full.encoder.fullCodecString,'avc1.42e028');
assert.equal(settings({resolution:'source'}).width,1080,'mode mobile : limite 1080p annoncée');
assert.equal(settings({resolution:'source',sourceWidth:480,sourceHeight:854}).width,480,'pas d’agrandissement en définition source');
const landscape=settings({ratio:16/9});assert.equal(landscape.width,1280);assert.equal(landscape.height,720);
const square=settings({ratio:1});assert.equal(square.width,720);assert.equal(square.height,720);
const standard=settings({resolution:'source',mode:'standard'});assert.equal(standard.width,2160);assert.equal(standard.height,3840);assert.equal(standard.fps,60);assert.equal(Object.keys(standard.encoder).length,0);
ctx.refreshExportOptions();assert.equal(controls['export-fps'].value,'30');assert(controls['export-fps'].disabled);assert(sourceOption.textContent.includes('1080p'));
controls['export-mode'].value='standard';ctx.refreshExportOptions();assert.equal(controls['export-fps'].value,'60');assert(!controls['export-fps'].disabled);
controls['export-mode'].value='mobile';ctx.refreshExportOptions();controls['export-mode'].value='standard';controls['export-fps'].value='60';ctx.refreshExportOptions(true);assert.equal(controls['export-fps'].value,'60','restaurer un projet Standard ne perd pas sa cadence');
controls['export-mode'].value='mobile';controls['export-fps'].value='0';ctx.refreshExportOptions(true);assert.equal(controls['export-fps'].value,'30','ancien projet : mode mobile utilisable avec cadence source stockée');
console.log('PASS : Baseline adapté au format, 30 i/s, HD/1080p, limite source explicite, format conservé, réglages standard et restauration des projets.');
