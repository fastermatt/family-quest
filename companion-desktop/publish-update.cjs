// Explicit operator action: publish only a tested Windows executable.
// Usage: node publish-update.cjs <exe> <sequence> <version> <server-directory>
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [exe,sequence,version,server]=process.argv.slice(2);const seq=Number(sequence);
if(!exe||!server||!Number.isInteger(seq)||seq<5||!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Invalid release arguments');
const key=fs.readFileSync(path.join(server,'.companion/update-signing.pem'));
const publicKey=crypto.createPublicKey(key).export({type:'spki',format:'der'}).subarray(-32).toString('base64');
if(publicKey!=='OhEnZ13gUc/92sAQ1BOLlb2z8OM2Lfj+MV6az7sMz8k=')throw Error('Wrong signing key');
const bytes=fs.readFileSync(exe);if(bytes.length>32*1024*1024||bytes.subarray(0,2).toString()!=='MZ')throw Error('Expected bounded Windows executable');
const dir=path.join(server,'.companion/updates');fs.mkdirSync(dir,{recursive:true});
const manifestPath=path.join(dir,'manifest.json');
if(fs.existsSync(manifestPath)){const old=JSON.parse(Buffer.from(JSON.parse(fs.readFileSync(manifestPath)).payload,'base64'));if(seq<=old.sequence)throw Error('Release sequence must increase');}
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const payload=Buffer.from(JSON.stringify({sequence:seq,version,sha256,size:bytes.length,protocol:1}));
const envelope={payload:payload.toString('base64'),signature:crypto.sign(null,payload,key).toString('base64')};
fs.writeFileSync(path.join(dir,sha256+'.exe'),bytes,{flag:'wx'});
fs.writeFileSync(manifestPath+'.tmp',JSON.stringify(envelope));fs.renameSync(manifestPath+'.tmp',manifestPath);
console.log('Published signed release',version,'sequence',seq,'SHA256',sha256);
