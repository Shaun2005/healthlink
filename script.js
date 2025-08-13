/* Tiny "backend" using localStorage so forms actually save & load */

const DB = {
  save(key, data){
    localStorage.setItem(key, JSON.stringify(data));
  },
  load(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch{ return fallback; }
  },
  push(key, item){
    const list = DB.load(key, []);
    list.push(item); DB.save(key, list);
    return list;
  }
};

// ----- Registration -----
function handleRegistration(){
  const form = document.getElementById('registerForm');
  if(!form) return;

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const user = {
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim(),
      password: form.password.value, // demo only
      createdAt: new Date().toISOString()
    };
    if(!user.fullName || !user.email || !user.password){
      alert('Please complete name, email and password');
      return;
    }
    // Basic duplicate check
    const users = DB.load('users', []);
    if(users.some(u => u.email === user.email)){
      alert('An account with that email already exists.');
      return;
    }
    users.push(user); DB.save('users', users);
    localStorage.setItem('currentUserEmail', user.email);
    alert('Registration successful! You are now signed in.');
    window.location.href = 'index.html';
  });
}

// ----- Simple auth banner -----
function showWelcome(){
  const mount = document.getElementById('welcomeMount');
  if(!mount) return;
  const email = localStorage.getItem('currentUserEmail');
  if(!email){ mount.innerHTML = '<span class="badge">Guest</span>'; return; }
  const user = DB.load('users', []).find(u => u.email === email);
  mount.innerHTML = user ? Welcome, <b>${user.fullName}</b> : '<span class="badge">Guest</span>';
}

// ----- Chat (Consult page) -----
function consultInit(){
  const box = document.getElementById('chatBox');
  const form = document.getElementById('chatForm');
  if(!box || !form) return;

  function render(){
    box.innerHTML = '';
    const msgs = DB.load('messages', []);
    msgs.forEach(m=>{
      const div = document.createElement('div');
      div.className = 'msg ' + (m.role === 'you' ? 'you' : 'doc');
      div.innerText = m.text + (m.time ? `  ·  ${new Date(m.time).toLocaleString()}` : '');
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = form.message.value.trim();
    if(!text) return;
    DB.push('messages', {role:'you', text, time: Date.now()});
    form.reset();
    render();
    // auto-ack from doctor bot
    setTimeout(()=>{
      DB.push('messages', {role:'doc', text:'Doctor: Thanks for your message. A clinician will reply shortly.', time: Date.now()});
      render();
    }, 600);
  });

  render();

  // Call links (demo)
  const callNow = document.getElementById('callNow');
  if(callNow){
    callNow.addEventListener('click', ()=>{
      alert('This will use your phone dialer to call our triage line.');
      // Example Ghana triage line
      window.location.href = 'tel:+233201234567';
    });
  }
}

// ----- Diagnosis page -----
function diagnosisInit(){
  const form = document.getElementById('dxForm');
  const out = document.getElementById('dxResult');
  if(!form) return;

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const symptoms = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
    const note = form.freeText.value.trim();
    const result = basicTriage(symptoms, note);
    out.innerHTML = <div class="card"><h3>Preliminary Guidance</h3><p>${result}</p><p class="small">Saved to your records.</p></div>;
    DB.push('diagnoses', {symptoms, note, result, time: Date.now()});
  });

  function basicTriage(sym, note){
    const s = new Set(sym.map(v=>v.toLowerCase()));
    if(s.has('chest pain') && s.has('shortness of breath')) return 'Urgent: possible cardiac or respiratory issue. Seek emergency care immediately.';
    if(s.has('fever') && s.has('cough') && s.has('fatigue')) return 'Likely viral infection. Rest, hydrate, consider paracetamol. If symptoms persist >48 hours, book an appointment.';
    if(s.has('headache') && s.has('stiff neck')) return 'Concerning combination. Seek medical assessment as soon as possible.';
    if(s.has('abdominal pain') && s.has('vomiting')) return 'Possible gastroenteritis. Oral rehydration, light diet, and monitor. If severe pain or blood present, seek care.';
    if(note.toLowerCase().includes('pregnan')) return 'Pregnancy‑related concern. Please consult an obstetric clinician promptly.';
    return 'Monitor at home, use rest and fluids. If symptoms worsen or persist, please book an appointment.';
  }
}

// ----- Appointment page -----
const HOSPITALS = [
  {name:'Korle-Bu Teaching Hospital', lat:5.543, lon:-0.240},
  {name:'37 Military Hospital', lat:5.593, lon:-0.187},
  {name:'Komfo Anokye Teaching Hospital', lat:6.695, lon:-1.622},
  {name:'Cape Coast Teaching Hospital', lat:5.111, lon:-1.277},
  {name:'Tamale Teaching Hospital', lat:9.432, lon:-0.853}
];

function appointmentInit(){
  const form = document.getElementById('apptForm');
  const finder = document.getElementById('findNearest');
  const nearest = document.getElementById('nearest');
  if(!form) return;

  finder.addEventListener('click', ()=>{
    if(!navigator.geolocation){
      alert('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      const best = nearestHospital(latitude, longitude);
      nearest.value = best.name;
      alert(Nearest facility: ${best.name});
    }, ()=>{
      alert('Unable to get your location. You can choose a hospital manually.');
    });
  });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const appt = {
      name: form.name.value.trim(),
      reason: form.reason.value.trim(),
      date: form.date.value,
      time: form.time.value,
      hospital: form.hospital.value || form.nearest.value,
      createdAt: Date.now()
    };
    if(!appt.name || !appt.reason || !appt.date || !appt.time){
      alert('Please complete all fields.');
      return;
    }
    DB.push('appointments', appt);
    alert('Appointment booked! We saved it locally.');
    window.location.href = 'index.html';
  });

  function nearestHospital(lat, lon){
    let best=null, bestD=Infinity;
    for(const h of HOSPITALS){
      const d = haversine(lat, lon, h.lat, h.lon);
      if(d < bestD){ best = h; bestD = d; }
    }
    return best;
  }
  function haversine(lat1, lon1, lat2, lon2){
    const toRad = x=>x*Math.PI/180;
    const R=6371;
    const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)*2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*2;
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}

// ----- Dashboard bits on Home -----
function dashboardInit(){
  const mountAppts = document.getElementById('apptsMount');
  const mountMsgs = document.getElementById('msgsMount');
  if(mountAppts){
    const appts = DB.load('appointments', []).slice(-5).reverse();
    if(appts.length===0){ mountAppts.innerHTML = '<p class="small">No appointments yet.</p>'; }
    else{
      mountAppts.innerHTML = '<table class="table"><thead><tr><th>When</th><th>Hospital</th><th>Reason</th></tr></thead><tbody>'
        + appts.map(a=><tr><td>${a.date} ${a.time}</td><td>${a.hospital}</td><td>${a.reason}</td></tr>).join('')
        + '</tbody></table>';
    }
  }
  if(mountMsgs){
    const msgs = DB.load('messages', []).slice(-5).reverse();
    if(msgs.length===0){ mountMsgs.innerHTML = '<p class="small">No consultation messages yet.</p>'; }
    else{
      mountMsgs.innerHTML = msgs.map(m=><div class="msg ${m.role==='you'?'you':'doc'}">${m.text}</div>).join('');
    }
  }
}

// ---- Page router ----
document.addEventListener('DOMContentLoaded', ()=>{
  handleRegistration();
  consultInit();
  diagnosisInit();
  appointmentInit();
  dashboardInit();
  showWelcome();

  // nav active link
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a=>{
    if(a.getAttribute('href')===here) a.classList.add('active');
  })
});