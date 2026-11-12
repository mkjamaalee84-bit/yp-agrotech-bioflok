import { auth, db } from './firebase.js';
import html2pdf from 'html2pdf.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

function firebaseErrorMessage(err){
  const messages={
    'auth/invalid-credential':'E-mel atau kata laluan tidak tepat.',
    'auth/user-not-found':'Akaun pengguna tidak dijumpai.',
    'auth/wrong-password':'Kata laluan tidak tepat.',
    'auth/too-many-requests':'Terlalu banyak cubaan. Cuba lagi kemudian.',
    'auth/network-request-failed':'Rangkaian bermasalah. Sila semak internet.'
  };
  return messages[err?.code] || 'Log masuk gagal. Semak akaun Firebase Authentication anda.';
}

/* YP AGROTECH BIOFLOK BOS — Firebase + Cloud Firestore + Mobile PDF */
const $=id=>document.getElementById(id);
const today=()=>{
  const d=new Date();
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initialPonds='ABCDEFG'.split('').flatMap(section=>[1,2,3,4,5].map(n=>({id:section+n,section,status:['A1','B1','C1'].includes(section+n)?'Kuarantin':'Aktif',temp:'',ph:'',do:''})));
let data=loadData(),user=null,currentPage='dashboard',modalHandler=null,cloudBaseline=null,cloudReady=false;

function defaultData(){return {ponds:initialPonds,operations:[],inventory:[
  {id:uid(),name:'Pelet ikan',category:'Makanan',qty:50,unit:'kg',min:15},
  {id:uid(),name:'Garam bioflok',category:'Rawatan',qty:20,unit:'kg',min:5},
  {id:uid(),name:'Kit ujian air',category:'Peralatan',qty:3,unit:'unit',min:2}
],updated:new Date().toISOString()};}
function loadData(){
  try {
    const raw=localStorage.getItem('ypBioflokData');
    if(!raw)return defaultData();
    const d=JSON.parse(raw);
    if(d&&Array.isArray(d.ponds)&&Array.isArray(d.operations)&&Array.isArray(d.inventory))return d;
  } catch(e){console.warn('Data setempat tidak dapat dibaca:',e);}
  return defaultData();
}
function persistLocal(){
  try { localStorage.setItem('ypBioflokData',JSON.stringify(data)); return true; }
  catch(err){ console.error(err); toast('Storan peranti penuh atau tidak tersedia. Eksport sandaran data anda.'); return false; }
}
function cloneData(value){return JSON.parse(JSON.stringify(value));}
function indexById(items){return new Map(items.map(item=>[String(item.id),item]));}
async function syncCloudChanges(){
  if(!auth.currentUser||!cloudReady||!cloudBaseline)return;
  const uidNow=auth.currentUser.uid;
  const target=cloneData(data);
  const jobs=[];
  const groups=[['ponds','ponds'],['operations','operations'],['inventory','inventory']];
  for(const [key,path] of groups){
    const before=indexById(cloudBaseline[key]||[]),after=indexById(target[key]||[]);
    for(const [id,old] of before){
      if(!after.has(id)){
        if(user?.role==='Admin')jobs.push(deleteDoc(doc(db,path,id)));
      }
    }
    for(const [id,item] of after){
      const old=before.get(id);
      if(!old){
        const payload={...item};
        if(key==='operations'){
          payload.createdBy=uidNow;
          if(user?.role==='Operator')payload.status='Menunggu';
        }
        jobs.push(setDoc(doc(db,path,id),payload));
      }else if(JSON.stringify(old)!==JSON.stringify(item)){
        if(key==='operations'){
          const allowed=['status','approvedBy','approvedAt','rejectedBy','rejectedAt'];
          const patch={};
          for(const field of allowed)if(item[field]!==old[field])patch[field]=item[field];
          if(Object.keys(patch).length)jobs.push(updateDoc(doc(db,path,id),patch));
        }else{
          jobs.push(updateDoc(doc(db,path,id),item));
        }
      }
    }
  }
  await Promise.all(jobs);
  cloudBaseline=target;
  if(JSON.stringify(data)!==JSON.stringify(target))await syncCloudChanges();
}
function save(){
  data.updated=new Date().toISOString();
  const localOK=persistLocal();
  renderAll();
  if(auth.currentUser&&cloudReady){
    syncCloudChanges().then(()=>toast('Data berjaya disimpan dan disegerakkan ke awan.'))
      .catch(err=>{console.error('Cloud sync failed:',err);toast('AMARAN: Data hanya disimpan pada peranti. Penyegerakan awan gagal; semak akses Firebase dan cuba semula.');});
  }else if(!auth.currentUser){toast('Data disimpan pada peranti ini sahaja. Log masuk untuk penyegerakan awan.');}
  return localOK;
}

function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}
function badge(status){let c=status==='Diluluskan'?'':status==='Menunggu'?'warn':status==='Ditolak'?'red':status==='Kuarantin'?'warn':status==='Penyelenggaraan'?'gray':'';return `<span class="badge ${c}">${escapeHTML(status)}</span>`}

function login(name,role){
  user={name,role};
  $('loginView').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('userName').textContent=name;
  $('userRole').textContent=role;
  $('userAvatar').textContent=name.charAt(0).toUpperCase();
  $('todayText').textContent=new Date().toLocaleDateString('ms-MY',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  applyRole();
  renderAll();
}

// Pulihkan sesi Firebase dan muatkan rekod daripada koleksi berasingan.
onAuthStateChanged(auth, async (firebaseUser)=>{
  cloudReady=false;
  if(!firebaseUser){
    user=null;cloudBaseline=null;
    $('app').classList.add('hidden');$('loginView').classList.remove('hidden');
    return;
  }
  try {
    const profileSnap=await getDoc(doc(db,'users',firebaseUser.uid));
    if(!profileSnap.exists())throw new Error('Profil pengguna belum disediakan. Hubungi pentadbir sistem.');
    const profile=profileSnap.data(),role=profile.role;
    if(!['Admin','Penyelia','Operator'].includes(role))throw new Error('Peranan pengguna tidak sah.');
    user={name:profile.name||firebaseUser.email||'Pengguna',role};
    const [pondSnap,opSnap,stockSnap]=await Promise.all([
      getDocs(collection(db,'ponds')),getDocs(collection(db,'operations')),getDocs(collection(db,'inventory'))
    ]);
    const anyCloud=pondSnap.size+opSnap.size+stockSnap.size>0;
    if(anyCloud){
      data={ponds:pondSnap.docs.map(d=>d.data()),operations:opSnap.docs.map(d=>d.data()),inventory:stockSnap.docs.map(d=>d.data()),updated:new Date().toISOString()};
    }else{
      // Migrasi dokumen lama appData/main hanya oleh Admin.
      const legacy=await getDoc(doc(db,'appData','main'));
      if(legacy.exists()&&role==='Admin'){
        const old=legacy.data();
        if(Array.isArray(old.ponds)&&Array.isArray(old.operations)&&Array.isArray(old.inventory)){
          data=old;
          const batch=writeBatch(db);
          for(const item of data.ponds)batch.set(doc(db,'ponds',String(item.id)),item);
          for(const item of data.operations)batch.set(doc(db,'operations',String(item.id)),{...item,createdBy:item.createdBy||firebaseUser.uid});
          for(const item of data.inventory)batch.set(doc(db,'inventory',String(item.id)),item);
          await batch.commit();
        }
      }else if(role==='Admin'){
        const batch=writeBatch(db);
        for(const item of data.ponds)batch.set(doc(db,'ponds',String(item.id)),item);
        for(const item of data.operations)batch.set(doc(db,'operations',String(item.id)),{...item,createdBy:firebaseUser.uid});
        for(const item of data.inventory)batch.set(doc(db,'inventory',String(item.id)),item);
        await batch.commit();
      }else{
        data={ponds:[],operations:[],inventory:[],updated:new Date().toISOString()};
      }
    }
    cloudBaseline=cloneData(data);cloudReady=true;persistLocal();
    login(user.name,role);
  } catch(err) {
    console.error(err);toast(err.message||'Gagal memuatkan data awan. Semak Firestore Rules dan sambungan internet.');
    await signOut(auth);
  }
});

function applyRole(){
  document.querySelector('[data-page="approvals"]').classList.toggle('hidden',user.role==='Operator');
  $('addPondBtn').classList.toggle('hidden',user.role!=='Admin');
  $('addStockBtn').classList.toggle('hidden',user.role==='Operator');
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('loginName').value.trim();
  const password=$('loginPass').value;
  try {
    await signInWithEmailAndPassword(auth,email,password);
  } catch(err) {
    console.error(err);
    toast(firebaseErrorMessage(err));
  }
});

$('logoutBtn').onclick=async()=>{try{await signOut(auth)}catch(err){console.error(err);toast('Tidak berjaya log keluar.')}};

// Fungsi ini turut dipanggil oleh atribut onclick dalam templat jadual.
window.go=go;
window.editPond=editPond;
window.editStock=editStock;
window.approve=approve;
window.reject=reject;

function go(page){
  if(page==='approvals'&&user?.role==='Operator'){toast('Operator tidak mempunyai akses ke menu kelulusan.');return;}
  currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const titles={dashboard:'Dashboard Operasi',ponds:'Pengurusan Kolam',operations:'Rekod Operasi Harian',inventory:'Pengurusan Inventori',approvals:'Semakan & Kelulusan',reports:'Laporan & PDF'};
  $('pageTitle').textContent=titles[page];
  renderAll();
}

document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>go(b.dataset.goto));

function renderAll(){
  if(!user)return;
  renderDashboard();
  renderPonds();
  renderOperations();
  renderInventory();
  renderApprovals();
  renderReports();
}

function renderDashboard(){
  $('statPonds').textContent=data.ponds.length;
  $('statActive').textContent=data.ponds.filter(p=>p.status==='Aktif').length;
  $('statPending').textContent=data.operations.filter(o=>o.status==='Menunggu').length;
  $('statStock').textContent=data.inventory.length;

  $('dashboardPonds').innerHTML=data.ponds.map(p=>`<div class="pond ${p.status==='Kuarantin'?'quarantine':''}" onclick="go('ponds')"><b>${escapeHTML(p.id)}</b><small><i class="dot ${p.status==='Penyelenggaraan'?'warn':p.status==='Kuarantin'?'danger':''}"></i>${p.status==='Kuarantin'?'Kuarantin':p.status}</small></div>`).join('');
  const recent=[...data.operations].sort((a,b)=>(b.created||'').localeCompare(a.created||'')).slice(0,5);
  $('recentActivity').innerHTML=recent.length?recent.map(o=>`<div class="activityitem"><div class="activityicon">${escapeHTML(o.icon||'📋')}</div><div><b>${escapeHTML(o.type)} · Kolam ${escapeHTML(o.pond)}</b><small>${escapeHTML(o.date)} · ${escapeHTML(o.operator)} · ${escapeHTML(o.status)}</small></div></div>`).join(''):'<div class="empty">Belum ada rekod operasi.</div>';
  $('sectionSummary').innerHTML='ABCDEFG'.split('').map(s=>`<div class="stat" style="padding:11px"><div class="stathead">BAHAGIAN ${s}</div><strong style="font-size:20px">${data.ponds.filter(p=>p.section===s).length}</strong><small>kolam</small></div>`).join('');
}

function renderPonds(){
  const q=($('pondSearch').value||'').toLowerCase(),st=$('pondFilter').value,sec=$('sectionFilter').value;
  const list=data.ponds.filter(p=>p.id.toLowerCase().includes(q)&&(!st||p.status===st)&&(!sec||p.section===sec));
  $('pondCount').textContent=list.length+' kolam';
  $('pondTable').innerHTML=list.length?list.map(p=>`<tr><td><b>${escapeHTML(p.id)}</b>${['A1','B1','C1'].includes(p.id)?' <span class="badge warn">Kuarantin</span>':''}</td><td>Bahagian ${p.section}</td><td>${badge(p.status)}</td><td>${p.temp||'—'}</td><td>${p.ph||'—'}</td><td>${p.do||'—'}</td><td><button class="btn outline" onclick="editPond('${p.id}')">Kemaskini</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Tiada kolam ditemui.</td></tr>';
}

function renderOperations(){
  const q=($('opSearch').value||'').toLowerCase(),st=$('opStatusFilter').value;
  const list=[...data.operations].filter(o=>(o.pond+' '+o.type+' '+o.detail).toLowerCase().includes(q)&&(!st||o.status===st)).sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  $('opCount').textContent=list.length+' rekod';
  $('opTable').innerHTML=list.length?list.map(o=>`<tr><td>${escapeHTML(o.date)}<br><small class="muted">${escapeHTML(o.time||'')}</small></td><td><b>${escapeHTML(o.pond)}</b></td><td>${escapeHTML(o.icon||'📋')} ${escapeHTML(o.type)}</td><td>${escapeHTML(o.detail)}</td><td>${escapeHTML(o.operator)}</td><td>${badge(o.status)}</td><td>${user.role!=='Operator'&&o.status==='Menunggu'?`<button class="btn outline" onclick="go('approvals')">Semak</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Belum ada rekod operasi.</td></tr>';
}

function renderInventory(){
  const q=($('stockSearch').value||'').toLowerCase(),cat=$('stockFilter').value;
  const list=data.inventory.filter(i=>i.name.toLowerCase().includes(q)&&(!cat||i.category===cat));
  $('stockCount').textContent=list.length+' item';
  $('stockTable').innerHTML=list.length?list.map(i=>`<tr><td><b>${escapeHTML(i.name)}</b></td><td>${escapeHTML(i.category)}</td><td>${Number(i.qty)}</td><td>${escapeHTML(i.unit)}</td><td>${Number(i.min)}</td><td>${Number(i.qty)<=Number(i.min)?'<span class="badge red">Stok rendah</span>':'<span class="badge">Mencukupi</span>'}</td><td><button class="btn outline" onclick="editStock('${i.id}')">Kemaskini</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Tiada item inventori.</td></tr>';
}

function renderApprovals(){
  const list=[...data.operations].filter(o=>o.status==='Menunggu').sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  $('approvalCount').textContent=list.length+' menunggu';
  $('approvalList').innerHTML=list.length?list.map(o=>`<div class="approvalcard"><div><b>${escapeHTML(o.icon||'📋')} ${escapeHTML(o.type)} · Kolam ${escapeHTML(o.pond)}</b><small>${escapeHTML(o.date)} · ${escapeHTML(o.operator)} · ${escapeHTML(o.detail)}</small></div><div class="approvalactions"><button class="btn primary" onclick="approve('${o.id}')">✓ Lulus</button><button class="btn danger" onclick="reject('${o.id}')">Tolak</button></div></div>`).join(''):'<div class="empty">✨ Tiada rekod menunggu kelulusan.</div>';
}

function renderReports(){
  const total=data.operations.length,approved=data.operations.filter(o=>o.status==='Diluluskan').length,pending=data.operations.filter(o=>o.status==='Menunggu').length,rejected=data.operations.filter(o=>o.status==='Ditolak').length;
  $('reportSummary').innerHTML=`<div class="stats" style="grid-template-columns:repeat(4,1fr)"><div class="stat"><small>Jumlah rekod</small><strong>${total}</strong></div><div class="stat"><small>Diluluskan</small><strong>${approved}</strong></div><div class="stat"><small>Menunggu</small><strong>${pending}</strong></div><div class="stat"><small>Ditolak</small><strong>${rejected}</strong></div></div><p class="sectionnote">Data dikemas kini: ${new Date(data.updated||Date.now()).toLocaleString('ms-MY')}</p>`;
}

function openModal(title,body,handler,submit='Simpan Rekod'){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=body;
  $('modalSubmit').textContent=submit;
  $('modalBack').classList.add('show');
  modalHandler=handler;
}

function closeModal(){
  $('modalBack').classList.remove('show');
  $('modalForm').reset();
  modalHandler=null;
}

$('modalClose').onclick=$('modalCancel').onclick=closeModal;
$('modalBack').addEventListener('click',e=>{if(e.target===$('modalBack'))closeModal()});
$('modalForm').addEventListener('submit',e=>{
  e.preventDefault();
  if(!modalHandler)return;
  const result=modalHandler(new FormData(e.target));
  if(result===false)return;
  if(result&&typeof result.then==='function'){result.then(ok=>{if(ok!==false)closeModal();}).catch(err=>{console.error(err);toast('Tidak berjaya menyimpan rekod.');});return;}
  closeModal();
});

const group=(label,name,value,type='text',opts='')=>`<div class="formgroup"><label>${label}</label>${type==='select'?`<select class="field" name="${name}" ${opts}>${value}</select>`:`<input class="field" name="${name}" type="${type}" value="${escapeHTML(value??'')}" ${opts}>`}</div>`;

function editPond(id){
  if(!user || user.role!=='Admin'){toast('Hanya Admin boleh mengubah maklumat kolam.');return;}
  const p=data.ponds.find(x=>x.id===id);if(!p)return;
  openModal('Kemaskini Kolam',`<div class="formgrid">${group('NOMBOR KOLAM','id',p.id,'text','readonly')}${group('STATUS','status',['<option>Aktif</option>','<option>Penyelenggaraan</option>','<option>Kuarantin</option>'].map(x=>x.replace('>'+p.status+'<',' selected>'+p.status+'<')).join(''),'select')}${group('SUHU (°C)','temp',p.temp,'number','step="0.1"')}${group('pH','ph',p.ph,'number','step="0.1" min="0" max="14"')}${group('OKSIGEN TERLARUT (mg/L)','do',p.do,'number','step="0.1" min="0"')}</div>`,f=>{
    p.status=['A1','B1','C1'].includes(p.id)?'Kuarantin':f.get('status');
    p.temp=f.get('temp');p.ph=f.get('ph');p.do=f.get('do');
    save();toast('Maklumat kolam dikemas kini.');
  });
}

$('addPondBtn').onclick=()=>{if(user?.role!=='Admin'){toast('Hanya Admin boleh menambah kolam.');return;}openModal('Tambah Kolam',`<div class="formgrid">${group('ID KOLAM','id','','text','required placeholder="Contoh: H1"')}${group('STATUS','status','<option>Aktif</option><option>Penyelenggaraan</option>','select')}</div>`,f=>{
  let id=f.get('id').toUpperCase().trim();
  if(!/^[A-Z][0-9]+$/.test(id)||data.ponds.some(p=>p.id===id)){toast('ID kolam tidak sah atau telah digunakan.');return false}
  data.ponds.push({id,section:id[0],status:f.get('status'),temp:'',ph:'',do:''});
  save();toast('Kolam berjaya ditambah.');
});};

$('addOpBtn').onclick=()=>{
  if(!data.ponds.length)return;
  const pondOpts=data.ponds.map(p=>`<option>${escapeHTML(p.id)}</option>`).join('');
  openModal('Rekod Operasi Harian',`<div class="formgrid">${group('TARIKH','date',today(),'date','required')}${group('MASA','time',new Date().toTimeString().slice(0,5),'time','required')}${group('KOLAM','pond',pondOpts,'select')}${group('JENIS AKTIVITI','type','<option value="Pemberian makanan">🍽️ Pemberian makanan</option><option value="Ujian kualiti air">💧 Ujian kualiti air</option><option value="Mortaliti">🐟 Mortaliti</option><option value="Penyelenggaraan">🛠️ Penyelenggaraan</option><option value="Rawatan">🧪 Rawatan</option><option value="Lain-lain">📝 Lain-lain</option>','select')}<div class="formgroup full"><label>BUTIRAN / CATATAN</label><textarea class="field" name="detail" required placeholder="Nyatakan bacaan, kuantiti makanan, tindakan..."></textarea></div></div>`,f=>{
    const type=f.get('type');
    const icons={'Pemberian makanan':'🍽️','Ujian kualiti air':'💧','Mortaliti':'🐟','Penyelenggaraan':'🛠️','Rawatan':'🧪','Lain-lain':'📝'};
    data.operations.push({id:uid(),date:f.get('date'),time:f.get('time'),pond:f.get('pond'),type,icon:icons[type]||'📋',detail:f.get('detail'),operator:user.name,status:user.role==='Admin'||user.role==='Penyelia'?'Diluluskan':'Menunggu',created:new Date().toISOString()});
    save();toast('Rekod operasi berjaya dihantar.');
  });
};

function editStock(id){
  if(!user || !['Admin','Penyelia'].includes(user.role)){toast('Anda tiada kebenaran mengubah inventori.');return;}
  const i=data.inventory.find(x=>x.id===id);if(!i)return;
  openModal('Kemaskini Inventori',`<div class="formgrid">${group('NAMA ITEM','name',i.name)}${group('KATEGORI','category',['<option>Makanan</option>','<option>Rawatan</option>','<option>Peralatan</option>','<option>Lain-lain</option>'].map(x=>x.replace('>'+i.category+'<',' selected>'+i.category+'<')).join(''),'select')}${group('KUANTITI','qty',i.qty,'number','step="0.1" required')}${group('UNIT','unit',i.unit)}${group('STOK MINIMUM','min',i.min,'number','step="0.1" required')}</div>`,f=>{
    i.name=f.get('name');i.category=f.get('category');i.qty=Number(f.get('qty'));i.unit=f.get('unit');i.min=Number(f.get('min'));
    save();toast('Inventori dikemas kini.');
  });
}

$('addStockBtn').onclick=()=>{if(!user || !['Admin','Penyelia'].includes(user.role)){toast('Anda tiada kebenaran menambah inventori.');return;}openModal('Tambah Item Inventori',`<div class="formgrid">${group('NAMA ITEM','name','','text','required')}${group('KATEGORI','category','<option>Makanan</option><option>Rawatan</option><option>Peralatan</option><option>Lain-lain</option>','select')}${group('KUANTITI','qty','0','number','step="0.1" required')}${group('UNIT','unit','kg','text','required')}${group('STOK MINIMUM','min','5','number','step="0.1" required')}</div>`,f=>{
  data.inventory.push({id:uid(),name:f.get('name'),category:f.get('category'),qty:Number(f.get('qty')),unit:f.get('unit'),min:Number(f.get('min'))});
  save();toast('Item inventori berjaya ditambah.');
});};

function approve(id){if(!user || !['Admin','Penyelia'].includes(user.role)){toast('Anda tiada kebenaran meluluskan rekod.');return;}const o=data.operations.find(x=>x.id===id);if(o){o.status='Diluluskan';o.approvedBy=auth.currentUser?.uid||user.name;o.approvedAt=new Date().toISOString();delete o.rejectedBy;delete o.rejectedAt;save();toast('Rekod diluluskan.')}}
function reject(id){if(!user || !['Admin','Penyelia'].includes(user.role)){toast('Anda tiada kebenaran menolak rekod.');return;}const o=data.operations.find(x=>x.id===id);if(o){o.status='Ditolak';o.rejectedBy=auth.currentUser?.uid||user.name;o.rejectedAt=new Date().toISOString();delete o.approvedBy;delete o.approvedAt;save();toast('Rekod ditolak.')}}

// Direct Mobile PDF Generator using html2pdf.js
$('downloadPdfBtn').onclick=()=>{
  const nowStr = new Date().toLocaleDateString('ms-MY',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  $('pdfReportDate').textContent = 'Tarikh: ' + nowStr;
  $('pdfFooterTime').textContent = nowStr;
  $('pdfStatPonds').textContent = data.ponds.length;
  $('pdfStatActive').textContent = data.ponds.filter(p=>p.status==='Aktif').length;
  $('pdfStatOps').textContent = data.operations.length;
  $('pdfStatStock').textContent = data.inventory.length;

  const opsList = [...data.operations].sort((a,b)=>(b.created||'').localeCompare(a.created||'')).slice(0,25);
  $('pdfOpTableBody').innerHTML = opsList.length ? opsList.map(o=>`
    <tr>
      <td style="padding:6px;border:1px solid #ddd;">${escapeHTML(o.date)} ${escapeHTML(o.time||'')}</td>
      <td style="padding:6px;border:1px solid #ddd;"><b>${escapeHTML(o.pond)}</b></td>
      <td style="padding:6px;border:1px solid #ddd;">${escapeHTML(o.type)}</td>
      <td style="padding:6px;border:1px solid #ddd;">${escapeHTML(o.detail)}</td>
      <td style="padding:6px;border:1px solid #ddd;">${escapeHTML(o.operator)}</td>
      <td style="padding:6px;border:1px solid #ddd;">${escapeHTML(o.status)}</td>
    </tr>
  `).join('') : `<tr><td colspan="6" style="padding:10px;text-align:center;border:1px solid #ddd;">Tiada rekod operasi dijumpai.</td></tr>`;

  const element = $('pdfReportContainer');
  element.style.display = 'block';

  const opt = {
    margin:       10,
    filename:     `YP_Agrotech_Laporan_${today()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  toast('Sedang menjana PDF untuk telefon...');
  html2pdf().from(element).set(opt).save().then(()=>{
    element.style.display = 'none';
    toast('PDF berjaya dimuat turun ke telefon!');
  }).catch(err=>{
    console.error(err);
    element.style.display = 'none';
    toast('Gagal menjana PDF. Sila guna butang Cetak.');
  });
};

$('printPdfBtn').onclick=()=>window.print();

$('csvBtn').onclick=()=>{
  if(!data.operations.length){toast('Tiada data untuk dieksport.');return}
  const csvCell=value=>{
    let v=String(value??'').replace(/"/g,'""');
    if(/^[=+@\\-\\t\\r]/.test(v))v="'"+v;
    return `"${v}"`;
  };
  let csv='ID,Tarikh,Masa,Kolam,Aktiviti,Butiran,Operator,Status\\n'+data.operations.map(o=>
    [o.id,o.date,o.time,o.pond,o.type,o.detail,o.operator,o.status].map(csvCell).join(',')
  ).join('\\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`yp_agrotech_operasi_${today()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Fail CSV berjaya dimuat turun.');
};

$('jsonExportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`yp_agrotech_backup_${today()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Fail sandaran JSON dimuat turun.');
};

$('jsonImport').onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  if(user?.role!=='Admin'){toast('Hanya Admin boleh mengimport dan menggantikan semua data.');e.target.value='';return;}
  const reader=new FileReader();
  reader.onload=event=>{
    try{
      const parsed=JSON.parse(event.target.result);
      const valid=parsed&&Array.isArray(parsed.ponds)&&Array.isArray(parsed.operations)&&Array.isArray(parsed.inventory)
        && parsed.ponds.every(p=>p&&typeof p.id==='string'&&/^[A-Z][0-9]+$/.test(p.id)&&['Aktif','Penyelenggaraan','Kuarantin'].includes(p.status))
        && new Set(parsed.ponds.map(p=>p.id)).size===parsed.ponds.length
        && parsed.operations.every(o=>o&&typeof o.id==='string'&&typeof o.date==='string'&&typeof o.pond==='string'&&typeof o.type==='string'&&typeof o.detail==='string'&&['Menunggu','Diluluskan','Ditolak'].includes(o.status))
        && new Set(parsed.operations.map(o=>o.id)).size===parsed.operations.length
        && parsed.inventory.every(i=>i&&typeof i.id==='string'&&typeof i.name==='string'&&i.name.trim()!==''&&typeof i.unit==='string'&&Number.isFinite(Number(i.qty))&&Number(i.qty)>=0&&Number.isFinite(Number(i.min))&&Number(i.min)>=0)
        && new Set(parsed.inventory.map(i=>i.id)).size===parsed.inventory.length;
      if(valid){
        if(!confirm('Import akan menggantikan semua data semasa. Pastikan anda telah membuat sandaran. Teruskan?'))return;
        data={ponds:parsed.ponds,operations:parsed.operations,inventory:parsed.inventory,updated:new Date().toISOString()};
        save();toast('Data berjaya diimport!');
      }else{toast('Format atau kandungan fail tidak sah. Pastikan fail sandaran lengkap.')}
    }catch(err){toast('Ralat membaca fail JSON.')}
  };
  reader.readAsText(file);
  e.target.value='';
};
