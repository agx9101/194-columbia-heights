import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccSource, handleAccDownload } from '../acc.mjs';
const project='7c9a9f22-e8e8-4ada-8416-633a345b627b';
const root='urn:adsk.wipprod:fs.folder:co.root';
const child='urn:adsk.wipprod:fs.folder:co.child';
const deep='urn:adsk.wipprod:fs.folder:co.deep';
const env={ACC_ENABLED:'true',ACC_PROJECT_ID:project,ACC_ROOT_FOLDER_ID:root,APS_CLIENT_ID:'test-client',APS_CLIENT_SECRET:'test-secret'};
const version=(id,name)=>({type:'versions',id,attributes:{name,versionNumber:2,lastModifiedTime:'2026-10-20T01:00:00Z'},relationships:{storage:{data:{id:`urn:adsk.objects:os.object:test-bucket/${id}.pdf`}}}});
const item=(id,name)=>({type:'items',id,attributes:{displayName:name},relationships:{tip:{data:{id:`v-${id}`}}}});
const folder=(id,name)=>({type:'folders',id,attributes:{displayName:name}});
function fixture({empty=false,badNext=false,deny=false}={}) {
  const calls=[];let removed=false;
  const transport=async(input,options)=>{
    const u=new URL(input);calls.push(u);
    assert.equal(u.origin,'https://developer.api.autodesk.com');
    if(u.pathname==='/authentication/v2/token'){
      assert.equal(options.body,'grant_type=client_credentials&scope=data%3Aread');
      return Response.json({access_token:'test-access',expires_in:3600});
    }
    assert.equal(options.headers.Authorization,'Bearer test-access');
    if(deny)return new Response('',{status:403});
    const p=decodeURIComponent(u.pathname);
    if(p.endsWith(`/folders/${root}`))return Response.json({data:folder(root,'01 Issuances')});
    if(p.endsWith(`/folders/${root}/contents`)){
      if(empty||removed)return Response.json({data:[]});
      if(u.searchParams.get('page[number]')==='1')return Response.json({data:[folder(child,'2026-10-20'),item('other','ignore.rvt')]});
      const data=[item('root-pdf','Root.PDF'),item('text','notes.txt')];
      return Response.json({data,included:[version('v-root-pdf','Root.PDF')],links:{next:{href:badNext?'https://attacker.example/steal':u.origin+u.pathname+'?page%5Bnumber%5D=1'}}});
    }
    if(p.endsWith(`/folders/${child}/contents`))return Response.json({data:[folder(deep,'Structural'),item('a','Plans.pdf'),{...item('deleted','Deleted.pdf'),attributes:{displayName:'Deleted.pdf',extension:{data:{isDeleted:true}}}}]});
    if(p.endsWith(`/folders/${deep}/contents`))return Response.json({data:[item('b','Plans.pdf'),folder(child,'loop'),item('zip','Archive.pdf.zip'),item('fake','Actually-not.pdf')],included:[version('v-b','Plans.pdf'),version('v-fake','Model.rvt')]});
    if(p.includes('/versions/'))return Response.json({data:version(p.split('/versions/')[1],'Plans.pdf')});
    if(p.endsWith('/signeds3download'))return Response.json({status:'complete',url:'https://test-bucket.s3.amazonaws.com/document.pdf?test-signature=1'});
    throw new Error(`Unexpected mock API path: ${p}`);
  };
  return {source:createAccSource(env,transport),calls,remove(){removed=true;}};
}
test('recurses paginated subfolders, ignores other formats/deletions, keeps duplicate filenames in distinct folders',async()=>{
  const {source,calls}=fixture();const files=await source.list();
  assert.equal(files.length,3);
  assert.deepEqual(files.map(f=>[f.folder,f.name]),[['01 Issuances','Root.PDF'],['01 Issuances / 2026-10-20','Plans.pdf'],['01 Issuances / 2026-10-20 / Structural','Plans.pdf']]);
  assert.ok(files.every(f=>f.url.startsWith('/api/acc/pdf?id=')));
  assert.doesNotMatch(JSON.stringify(files),/test-access|test-secret|test-bucket/);
  const requests=calls.length;await source.list();assert.equal(calls.length,requests,'refresh uses bounded cache');
});
test('empty is distinct from permission failure and credentials are not in errors',async()=>{
  assert.deepEqual(await fixture({empty:true}).source.list(),[]);
  await assert.rejects(fixture({deny:true}).source.list(),/ACC request failed \(403\)/);
});
test('refuses pagination off the Autodesk origin before forwarding any token',async()=>{
  await assert.rejects(fixture({badNext:true}).source.list(),/Invalid ACC pagination/);
});
test('download validates current folder membership, including after a file is removed',async()=>{
  const f=fixture();await f.source.list();
  await assert.rejects(f.source.download('foreign-item'),e=>e.status===404);
  assert.match(await f.source.download('a'),/^https:\/\/test-bucket\.s3\.amazonaws\.com/);
  f.remove();await assert.rejects(f.source.download('a'),e=>e.status===404);
});
test('ACC file endpoint requires portal authentication before any lookup and sanitizes failures',async()=>{
  let lookups=0;const source={download:async()=>{lookups++;return 'https://test.s3.amazonaws.com/x.pdf';}};
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  await handleAccDownload({method:'GET',url:'/api/acc/pdf?id=a'},res,source,()=>false);
  assert.equal(res.status,401);assert.equal(lookups,0);
  await handleAccDownload({method:'GET',url:'/api/acc/pdf?id=a'},res,source,()=>true);
  assert.equal(res.status,302);assert.equal(lookups,1);assert.equal(res.headers['Cache-Control'],'no-store');
  await handleAccDownload({method:'GET',url:'/api/acc/pdf?id=a'},res,{download:async()=>{throw Error('secret upstream detail');}},()=>true);
  assert.equal(res.status,503);assert.doesNotMatch(res.body,/secret upstream detail/);
});
test('disabled or incomplete connections do not make API requests',async()=>{
  const fail=async()=>{throw Error('unexpected network');};
  assert.equal(createAccSource({},fail).enabled,false);
  await assert.rejects(createAccSource({ACC_ENABLED:'true'},fail).list(),/not configured/);
});
