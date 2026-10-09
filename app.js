(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const SERVICE = $('serviceStatus');
  let lastMessage = 'Drishti AI is ready.';
  let recognition = null;
  let ocrWorkerPromise = null;
  let lastOverpassRequestAt = 0;
  let nearbyCache = {};
  const stored = (key, fallback='') => { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } };
  $('home').value = stored('drishti_home');
  $('contact').value = stored('drishti_contact');
  $('language').value = stored('drishti_language', 'hi-IN');

  function language() { return $('language').value; }
  function say(message) {
    lastMessage = message;
    statusEl.textContent = message;
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language(); utterance.rate = 0.88; utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    button.disabled = busy;
    if (busy) { button.dataset.originalLabel = button.textContent; button.textContent = busyLabel || 'Please wait…'; }
    else if (button.dataset.originalLabel) { button.textContent = button.dataset.originalLabel; delete button.dataset.originalLabel; }
  }
  function updateNetwork() {
    const el = $('networkStatus');
    if (navigator.onLine) { el.textContent = 'Device reports online'; el.className = 'online'; }
    else { el.textContent = 'Offline'; el.className = 'offline'; }
  }
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  updateNetwork();

  function getPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not supported by this browser.'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout:18000, maximumAge: options.maximumAge ?? 5000 });
    });
  }
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R=6371000, rad=(n)=>n*Math.PI/180;
    const dLat=rad(lat2-lat1), dLon=rad(lon2-lon1);
    const a=Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function formatDistance(m) { return m < 1000 ? `${Math.round(m)} metres away` : `${(m/1000).toFixed(1)} kilometres away`; }
  function openMapDirections(place, coords = null, originCoords = null) {
    const dest = coords ? `${coords.lat},${coords.lon}` : place;
    const mode = $('travelMode').value;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${encodeURIComponent(mode)}`;
    if (originCoords && Number.isFinite(originCoords.lat) && Number.isFinite(originCoords.lon)) url += `&origin=${encodeURIComponent(`${originCoords.lat},${originCoords.lon}`)}`;
    if (mode === 'walking') url += '&dir_action=navigate';
    say(`Opening ${mode === 'transit' ? 'public transport' : mode} directions to ${place}. Review the route in Maps with your screen reader before moving.`);
    window.location.href = url;
  }
  async function directions(to) {
    const place = (to || $('destination').value).trim();
    if (!place) { say('Please say or enter a destination first.'); $('destination').focus(); return; }
    const btn = $('directions'); setBusy(btn, true, 'Getting your location…');
    let pos = null;
    try { pos = await getPosition(); }
    catch (_) { say('I could not get your location. I will open directions without a confirmed starting point.'); }
    setBusy(btn, false);
    // Route creation happens in Google Maps; the app does not claim live turn-by-turn guidance itself.
    if (pos) {
      const mode = $('travelMode').value;
      let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${pos.coords.latitude},${pos.coords.longitude}`)}&destination=${encodeURIComponent(place)}&travelmode=${encodeURIComponent(mode)}`;
      if (mode === 'walking') url += '&dir_action=navigate';
      say(`Opening directions to ${place}. Please verify the route and continue using your mobility aid.`);
      window.location.href = url;
    } else openMapDirections(place);
  }
  async function whereAmI() {
    say('Getting your current location.');
    try {
      const p = await getPosition();
      const link = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
      const msg = `My current location: ${link}`;
      if (navigator.share) {
        try { await navigator.share({title:'My current location', text:msg, url:link}); say('Share sheet opened. Choose a trusted contact.'); return; }
        catch (e) { if (e && e.name==='AbortError') { say('Sharing cancelled.'); return; } }
      }
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(msg); say('Location link copied. Open a message and send it to a trusted contact.'); }
      else { window.prompt('Copy and share this location link with a trusted contact:', msg); say('Location link is shown for copying.'); }
    } catch (_) { say('I could not get your location. Turn on location services and allow location permission, then try again.'); }
  }
  function emergency() {
    const ok = confirm('Open your phone dialer for India emergency number 112? Review the number and place the call yourself.');
    if (ok) window.location.href='tel:112';
    else say('Emergency dial cancelled. You can call 112 from your phone if needed.');
  }
  function callContact() {
    const n=$('contact').value.trim();
    if (!n) { say('No trusted contact saved yet. Enter the phone number in settings and save it.'); $('contact').focus(); return; }
    if (confirm(`Open the dialer to call your trusted contact, ${n}?`)) window.location.href=`tel:${n.replace(/[^+\d]/g,'')}`;
  }
  function saveValue(key, inputId, label) {
    try { const val=$(inputId).value.trim(); if (val) localStorage.setItem(key,val); else localStorage.removeItem(key); say(val ? `${label} saved on this device.` : `${label} cleared.`); }
    catch (_) { say(`I could not save ${label.toLowerCase()} in this browser.`); }
  }

  const nearbyConfig = {
    metro: { label:'metro or rail stations', radius:7000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["railway"="station"]; nwr(around:${r},${lat},${lon})["railway"="subway_entrance"];` },
    bus: { label:'bus stops', radius:3000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["highway"="bus_stop"]; nwr(around:${r},${lat},${lon})["public_transport"="platform"]["bus"="yes"];` },
    hospital: { label:'hospitals', radius:7000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["amenity"="hospital"];` },
    pharmacy: { label:'pharmacies', radius:4000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["amenity"="pharmacy"];` },
    atm: { label:'ATMs', radius:4000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["amenity"="atm"];` },
    toilets: { label:'public toilets', radius:4000, query:(lat,lon,r)=>`nwr(around:${r},${lat},${lon})["amenity"="toilets"];` }
  };
  function elementPoint(e) { return {lat:e.lat ?? e.center?.lat, lon:e.lon ?? e.center?.lon}; }
  function nameOf(e) { return e.tags?.name || e.tags?.['name:en'] || e.tags?.brand || e.tags?.operator || 'Unnamed mapped location'; }
  function makeOverpassQuery(kind, lat, lon) {
    const cfg=nearbyConfig[kind]; return `[out:json][timeout:25];(${cfg.query(lat,lon,cfg.radius)});out center tags;`;
  }
  async function getOverpass(query) {
    const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
    let lastError;
    for (const endpoint of endpoints) {
      try {
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json'},body:'data='+encodeURIComponent(query),cache:'no-store',signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`Online map service returned ${response.status}`);
        return await response.json();
      } catch (e) { lastError=e; }
    }
    throw lastError || new Error('Nearby place service unavailable');
  }
  function renderNearby(kind, elements, origin) {
    const area=$('nearbyResults'); area.innerHTML='';
    if (!elements.length) { area.textContent=`No mapped ${nearbyConfig[kind].label} found within the search area. Try a larger location or use Maps search.`; return; }
    const title=document.createElement('p'); title.innerHTML=`<strong>Nearby ${nearbyConfig[kind].label} — ranked by straight-line distance</strong>`; area.append(title);
    elements.slice(0,8).forEach(e=>{
      const p=elementPoint(e); if (!Number.isFinite(p.lat)||!Number.isFinite(p.lon)) return;
      const dist=distanceMeters(origin.lat,origin.lon,p.lat,p.lon);
      const row=document.createElement('div'); row.className='service-result';
      const name=document.createElement('strong'); name.textContent=nameOf(e); row.append(name);
      const d=document.createElement('div'); d.className='distance'; d.textContent=formatDistance(dist)+' (straight-line estimate)'; row.append(d);
      const tags=e.tags||{}; const info=[tags['addr:street'],tags['addr:suburb'],tags.operator].filter(Boolean).join(', ');
      if(info){const detail=document.createElement('div');detail.className='small';detail.textContent=info;row.append(detail);}
      const button=document.createElement('button'); button.className='secondary'; button.textContent=`Directions to ${nameOf(e)}`; button.addEventListener('click',()=>openMapDirections(nameOf(e),p,origin)); row.append(button); area.append(row);
    });
  }
  async function findNearby(kind, button) {
    if (!nearbyConfig[kind]) return;
    if (!navigator.onLine) { say('Internet is unavailable. Nearby live-place search needs an internet connection.'); return; }
    const now=Date.now();
    if (now-lastOverpassRequestAt<1800) await new Promise(r=>setTimeout(r,1800-(now-lastOverpassRequestAt)));
    const cached=nearbyCache[kind];
    if (cached && Date.now()-cached.time<120000) { renderNearby(kind,cached.items,cached.origin); say(`Showing recently retrieved nearby ${nearbyConfig[kind].label}.`); return; }
    setBusy(button,true,`Searching nearby ${nearbyConfig[kind].label}…`); say(`Getting your location and searching online for ${nearbyConfig[kind].label}.`); SERVICE.textContent='Querying nearby map data…';
    try {
      const gps=await getPosition(); const origin={lat:gps.coords.latitude,lon:gps.coords.longitude};
      const q=makeOverpassQuery(kind,origin.lat,origin.lon); lastOverpassRequestAt=Date.now();
      const json=await getOverpass(q);
      const items=(json.elements||[]).map(e=>({...e,_point:elementPoint(e)})).filter(e=>Number.isFinite(e._point.lat)&&Number.isFinite(e._point.lon));
      items.sort((a,b)=>distanceMeters(origin.lat,origin.lon,a._point.lat,a._point.lon)-distanceMeters(origin.lat,origin.lon,b._point.lat,b._point.lon));
      nearbyCache[kind]={time:Date.now(),items,origin}; renderNearby(kind,items,origin);
      SERVICE.textContent='Nearby place data retrieved online';
      say(items.length?`Found ${items.length} mapped results for ${nearbyConfig[kind].label}. Results may be incomplete; check each destination in Maps.`:`No mapped ${nearbyConfig[kind].label} found nearby.`);
    } catch(e) {
      SERVICE.textContent='Nearby service unavailable'; $('nearbyResults').textContent='I could not reach the online nearby-place service. Check the connection and try later, or search in Maps.';
      say('Online nearby-place search is not available right now. Please try again later.');
    } finally { setBusy(button,false); }
  }

  function startListening() {
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){say('Voice recognition is not supported in this browser. Try Chrome on Android with internet access, or use the buttons and text fields.');return;}
    if(recognition){try{recognition.stop();}catch(_) {}}
    recognition=new SpeechRecognition(); recognition.lang=language(); recognition.interimResults=false; recognition.maxAlternatives=1;
    recognition.onstart=()=>{statusEl.textContent=language()==='hi-IN'?'सुन रही हूँ। बोलिए।':'Listening. Please speak now.';};
    recognition.onerror=(e)=>say(`Voice recognition stopped: ${e.error}. Try again or use the buttons.`);
    recognition.onresult=(e)=>handleCommand(e.results[0][0].transcript);
    recognition.start();
  }
  function handleCommand(raw) {
    const q=raw.trim().toLowerCase(); if(!q){say('I did not hear a command. Please try again.');return;}
    if(q.includes('emergency')||q.includes('help')||q.includes('मदद')||q.includes('आपात')){emergency();return;}
    if(q.includes('where am i')||q.includes('my location')||q.includes('लोकेशन')||q.includes('कहाँ हूँ')){whereAmI();return;}
    if(q.includes('take me home')||q.includes('go home')||q.includes('घर चल')||q.includes('घर ले')){const h=$('home').value.trim(); if(h)directions(h);else say('Home is not saved yet. Enter your home address and save it first.');return;}
    if(q.includes('call my contact')||q.includes('मेरे संपर्क')||q.includes('फोन करो')){callContact();return;}
    if(q.includes('nearest metro')||q.includes('metro station')||q.includes('नजदीकी मेट्रो')){findNearby('metro');return;}
    if(q.includes('nearest hospital')||q.includes('अस्पताल')){findNearby('hospital');return;}
    if(q.includes('nearest pharmacy')||q.includes('chemist')||q.includes('दवाई की दुकान')){findNearby('pharmacy');return;}
    if(q.includes('nearest bus')||q.includes('बस स्टॉप')){findNearby('bus');return;}
    if(q.includes('repeat')||q.includes('दोहर')){say(lastMessage);return;}
    if(q.includes('stop speaking')||q.includes('आवाज बंद')){window.speechSynthesis?.cancel();say('Spoken audio stopped.');return;}
    $('destination').value=raw; say(`I heard ${raw}. Please check the destination using your screen reader, then activate Open directions in Maps.`);
  }

  async function loadOcrWorker() {
    if(ocrWorkerPromise)return ocrWorkerPromise;
    ocrWorkerPromise=(async()=>{
      if(!window.Tesseract){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Could not download the text-reading engine.'));document.head.append(s);});}
      if(!window.Tesseract)throw new Error('Text-reading engine did not load.');
      return await window.Tesseract.createWorker('eng+hin',1,{logger:(m)=>{if(m.status&&m.progress!==undefined)$('ocrStatus').textContent=`Text reader: ${m.status} ${Math.round(m.progress*100)}%`;}});
    })().catch(e=>{ocrWorkerPromise=null;throw e;});
    return ocrWorkerPromise;
  }
  async function readPhoto() {
    const file=$('cameraInput').files?.[0]; if(!file){say('Please take or select a photo first.');$('cameraInput').focus();return;}
    setBusy($('readPhoto'),true,'Loading text reader…'); $('ocrStatus').textContent='Loading text-reading engine and language data. First use may take time and requires internet.';
    try {
      const worker=await loadOcrWorker(); $('ocrStatus').textContent='Reading text in the selected photo…';
      const result=await worker.recognize(file); const text=(result.data.text||'').trim();
      $('ocrText').textContent=text||'No readable text was detected. Try better lighting, a closer photo, and a steady camera.';
      $('ocrStatus').textContent='Text reading finished. Accuracy is not guaranteed.';
      if(text) say(`I read the following text: ${text.slice(0,1200)}`); else say('I could not read text from this photo. Please try another photo.');
    } catch(e) { $('ocrStatus').textContent=`Text reader error: ${e.message||'unknown error'}`; say('Text reading failed. Check the internet connection and try again.'); }
    finally {setBusy($('readPhoto'),false);}
  }

  $('speak').addEventListener('click',startListening);
  $('repeat').addEventListener('click',()=>say(lastMessage));
  $('stop').addEventListener('click',()=>{if('speechSynthesis'in window)window.speechSynthesis.cancel();if(recognition){try{recognition.stop();}catch(_){}} statusEl.textContent='Spoken audio stopped.';});
  $('directions').addEventListener('click',()=>directions());
  $('destination').addEventListener('keydown',e=>{if(e.key==='Enter')directions();});
  $('goHome').addEventListener('click',()=>{const h=$('home').value.trim(); if(h)directions(h); else {say('Please save your home address first.');$('home').focus();}});
  $('where').addEventListener('click',whereAmI);
  $('saveHome').addEventListener('click',()=>saveValue('drishti_home','home','Home address'));
  $('saveContact').addEventListener('click',()=>saveValue('drishti_contact','contact','Trusted contact'));
  $('callContact').addEventListener('click',callContact);
  $('emergency').addEventListener('click',emergency);
  document.querySelectorAll('[data-nearby]').forEach(btn=>btn.addEventListener('click',()=>findNearby(btn.dataset.nearby,btn)));
  $('readPhoto').addEventListener('click',readPhoto);
  $('language').addEventListener('change',()=>{try{localStorage.setItem('drishti_language',language());}catch(_){}say(language()==='hi-IN'?'भाषा हिंदी कर दी गई है।':'Language set to English.');});
  async function checkInternetReachability() {
    updateNetwork();
    const btn=$('checkInternet'); setBusy(btn,true,'Checking internet…');
    if (!navigator.onLine) { SERVICE.textContent='Device reports offline'; setBusy(btn,false); say('The device reports that it is offline. Connect to the internet and try again.'); return; }
    try {
      // Minimal no-cors connectivity probe. Opaque response is expected; resolving means a request reached the service.
      await fetch('https://www.google.com/generate_204',{mode:'no-cors',cache:'no-store',signal:AbortSignal.timeout(7000)});
      SERVICE.textContent='Internet reachability confirmed; other providers may still be unavailable'; say('The internet connection responded. Nearby map data and text recognition are separate services and may still be unavailable.');
    } catch (_) { SERVICE.textContent='Device says online, but internet could not be confirmed'; say('Your phone reports a connection, but I could not verify access to the internet. Try checking Wi-Fi or mobile data.'); }
    finally { setBusy(btn,false); }
  }
  $('checkInternet').addEventListener('click',checkInternetReachability);
  $('clearSettings').addEventListener('click',()=>{if(confirm('Clear saved home and trusted contact from this device?')){localStorage.removeItem('drishti_home');localStorage.removeItem('drishti_contact');$('home').value='';$('contact').value='';say('Saved home and trusted contact have been cleared from this browser.');}});
  if('serviceWorker'in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  setTimeout(()=>say('Drishti AI is ready. Tap Speak to Drishti, enter a destination, or search for nearby services.'),500);
})();
