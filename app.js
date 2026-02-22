  // --- ICS import utilities ---
  function importICSContent(text){
    const vevents = text.split(/BEGIN:VEVENT/i).slice(1);
    const assignmentsAdded = [];
    const classesAdded = [];
    vevents.forEach(block=>{
      const lines = block.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const obj = {};
      lines.forEach(l=>{ const [k,v] = l.split(':',2); if(!k) return; const key = k.split(';')[0].toUpperCase(); if(!obj[key]) obj[key]=v; else obj[key]+= '\n'+v });
      const summary = obj['SUMMARY']||''; const uid = obj['UID']||''; const rrule = obj['RRULE']||''; const dtstart = obj['DTSTART']||obj['DTSTART;VALUE=DATE']||''; const dtend = obj['DTEND']||'';
      // Assignment detection: non-recurring event (no RRULE)
      if(!rrule){
        // Parse assignment details
        const dt = parseICSDatetime(dtstart);
        const hours = 2; // default estimate
        const courseMatch = summary.match(/\[([A-Z0-9\-]+)\]/);
        const course = courseMatch ? courseMatch[1] : 'Course';
        const title = summary.replace(/\[.*?\]/,'').trim().substring(0,40);
        const assignments = loadAssignments();
        // avoid duplicates by course+title+date
        const exists = assignments.find(a=>a.course===course && a.title===title && formatDate(a.due)===formatDate(dt));
        if(!exists){ assignments.push({id:Date.now()+Math.random(), course, title, due:dt, hours}); saveAssignments(assignments); assignmentsAdded.push(title) }
        return;
      }
      // Class detection: recurring events
      if(rrule){
        let meetingDays = [];
        const m = rrule.match(/BYDAY=([^;]+)/); if(m){ meetingDays = m[1].split(',').map(x=>bydayToIndex(x)) }
        else if(/FREQ=WEEKLY/i.test(rrule)){
          const dt = parseICSDatetime(dtstart); if(dt) meetingDays = [ (dt.getUTCDay()+6)%7 ]
        }
        if(meetingDays.length===0){ const dt = parseICSDatetime(dtstart); if(dt){ meetingDays = [ (dt.getUTCDay()+6)%7 ] } }
        if(meetingDays.length===0) return;
        const dt = parseICSDatetime(dtstart); const dt2 = parseICSDatetime(dtend);
        let meetingStart = '';
        let meetingDuration = 1;
        if(dt){ const hh = dt.getUTCHours().toString().padStart(2,'0'); const mm = dt.getUTCMinutes().toString().padStart(2,'0'); meetingStart = hh+':'+mm }
        if(dt && dt2){ meetingDuration = Math.max(0.25, (dt2 - dt)/36e5) }
        const nameMatch = summary.match(/([A-Z]{2,}\s?-?\s?\d{2,})|([A-Z]{2,}\d{2,})/);
        const className = (nameMatch && nameMatch[0]) ? nameMatch[0].replace(/\s+/g,'') : summary.split(/\-|\(|:/)[0].trim().substring(0,20);
        const classes = loadClasses();
        const exists = classes.find(c=>c.name===className && c.meetingStart===meetingStart && JSON.stringify(c.meetingDays)===JSON.stringify(meetingDays));
        if(!exists){ classes.push({id:Date.now()+Math.random(), name:className||summary.substring(0,20), hours:meetingDuration, meetingDays, meetingStart, meetingDuration}); saveClasses(classes); classesAdded.push(className) }
      }
    })
    if(assignmentsAdded.length) {
      patchChecklistAssignments();
      drawCalendar();
      addChatLine('System',`Imported ${assignmentsAdded.length} assignments from ICS`)
    }
    if(classesAdded.length) {
      renderClasses(); drawCalendar(); addChatLine('System',`Imported ${classesAdded.length} classes from ICS`)
    }
    if(!assignmentsAdded.length && !classesAdded.length) addChatLine('System','No assignments or recurring class meetings found in ICS')
  }

  // assignment storage
  function loadAssignments(){ return JSON.parse(localStorage.getItem(LS_PREFIX+'assignments')||'[]') }
  function saveAssignments(a){ localStorage.setItem(LS_PREFIX+'assignments', JSON.stringify(a)) }
  // patch checklist to use dynamic assignments
  function patchChecklistAssignments(){
    // Always use imported assignments if present, else fallback to mock
    const imported = loadAssignments();
    window.assignments = (imported && imported.length) ? imported : assignments;
    renderChecklist();
  }
// Minimal front-end logic: mock AI checklist, canvas calendar, chat bot, leaderboard, settings
(function(){
  const LS_PREFIX='fa:'
  const el = id=>document.getElementById(id)

  // defaults
  const defaultUser = {name:'You',points:0}

  function loadSettings(){
    const s = JSON.parse(localStorage.getItem(LS_PREFIX+'settings')||'null') || defaultUser
    return s
  }
  function saveSettings(s){ localStorage.setItem(LS_PREFIX+'settings',JSON.stringify(s)) }

  // leaderboard
  function loadBoard(){return JSON.parse(localStorage.getItem(LS_PREFIX+'board')||'[]')}
  function saveBoard(b){localStorage.setItem(LS_PREFIX+'board',JSON.stringify(b))}

  // schedule storage (array of blocks)
  function loadSchedule(){return JSON.parse(localStorage.getItem(LS_PREFIX+'schedule')||'[]')}
  function saveSchedule(s){localStorage.setItem(LS_PREFIX+'schedule',JSON.stringify(s))}

  // mock data: assignments
  const assignments = [
    {id:1,course:'CS101',title:'Homework 4',due:addDays(new Date(),2),hours:2},
    {id:2,course:'MATH201',title:'Quiz prep',due:addDays(new Date(),1),hours:1.5},
    {id:3,course:'ENG150',title:'Essay draft',due:addDays(new Date(),5),hours:4}
  ]

  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}

  // render checklist
  function renderChecklist(){
    const container=el('checklist');container.innerHTML=''
    const list = generateChecklist(window.assignments || assignments, loadSettings())
    const completions = loadCompletions()
    const history = loadHistory ? loadHistory() : []
    list.forEach(item=>{
      // skip items that have been archived to history
      if(history.find(h=>h.originalId===item.id)) return;
      const it = document.createElement('div'); it.className='item';
      const comp = completions.find(c=>c.id===item.id)
      const gradeText = comp ? (comp.gradeLetter ? ` <small style="color:var(--muted);margin-left:8px">${comp.grade}${comp.gradeLetter?(' · '+comp.gradeLetter):''}</small>` : (comp.grade? ` <small style="color:var(--muted);margin-left:8px">${comp.grade}</small>` : '')) : ''
      const confHtml = comp? `<div style="display:flex;align-items:center"><div style="font-size:18px;margin-left:8px">${comp.emoji||''}</div>${gradeText}</div>` : ''
      // if completed, show struck-through style
      const doneClass = (comp && comp.completed)? 'done' : ''
      it.innerHTML = `<div style="display:flex;align-items:center" class="${doneClass}"><div style="flex:1"><strong>${item.course}</strong> — ${item.title} <div style="font-size:12px;color:var(--muted)">${formatDate(item.due)} · ${item.hours} hr(s)</div></div>${confHtml}</div>`
      const actions = document.createElement('div')
      const done = document.createElement('button'); done.className='btn small'; done.textContent='Done'
      done.onclick = ()=>{
        // show inline emoji picker attached to actions
        showEmojiPicker(actions, choice=>{
          if(!choice) return;
          const r = choice;
          const map = {1:'😃',2:'🙂',3:'😐',4:'🙁',5:'😟'}
          markComplete(item.id, map[r], r)
          // move to history when completed
          if(typeof moveToHistory === 'function') moveToHistory(item.id)
          // award points (base + small bonus for high confidence)
          givePoints(5 + (r===1?3:(r===2?2:(r===3?1:0))))
          renderChecklist()
        })
      }
      actions.appendChild(done)

      // grade button
      const gradeBtn = document.createElement('button'); gradeBtn.className='btn small ghost'; gradeBtn.textContent = comp && comp.grade? ('Grade: '+comp.grade) : 'Add Grade';
      gradeBtn.onclick = ()=>{ const g = prompt('Enter grade (numeric or letter, e.g. 92 or B+)'); if(!g) return; setGradeEnhanced(item.id,g); renderChecklist(); addChatLine('System',`Saved grade for ${item.title}: ${g}`) }
      actions.appendChild(gradeBtn)

      // undo button if completed
      if(comp && comp.completed){ const undo = document.createElement('button'); undo.className='btn small ghost'; undo.textContent='Undo'; undo.onclick = ()=>{ unComplete(item.id); renderChecklist() }; actions.appendChild(undo) }

      it.appendChild(actions)
      container.appendChild(it)
    })
    // add analyze grades button below checklist
    let analyze = el('analyzeGrades');
    if(!analyze){ analyze = document.createElement('button'); analyze.id='analyzeGrades'; analyze.className='btn small'; analyze.textContent='Analyze Grades'; container.appendChild(document.createElement('hr')); container.appendChild(analyze); analyze.onclick = analyzeGrades }
  }

  // completions: store when a user finishes an assignment with a confidence emoji
  function loadCompletions(){ return JSON.parse(localStorage.getItem(LS_PREFIX+'completions')||'[]') }
  function saveCompletions(c){ localStorage.setItem(LS_PREFIX+'completions', JSON.stringify(c)) }
  function addCompletion(id, emoji, rating){ const comps = loadCompletions(); const now = new Date(); const existing = comps.find(x=>x.id===id); if(existing){ existing.emoji=emoji; existing.rating=rating; existing.date=now } else { comps.push({id,emoji,rating,date:now}) } saveCompletions(comps) }

  function markComplete(id, emoji, rating){ const comps = loadCompletions(); const now = new Date(); const existing = comps.find(x=>x.id===id); if(existing){ existing.emoji=emoji; existing.rating=rating; existing.date=now; existing.completed=true } else { comps.push({id,emoji,rating,date:now,completed:true}) } saveCompletions(comps) }

  function setGrade(id, grade){ const comps = loadCompletions(); const existing = comps.find(x=>x.id===id); if(existing){ existing.grade = grade; existing.date = new Date() } else { comps.push({id,grade,date:new Date()}) } saveCompletions(comps) }

  // enhanced grade setter: if numeric, also store a letter grade
  function setGradeEnhanced(id, gradeInput){ const comps = loadCompletions(); const existing = comps.find(x=>x.id===id); const raw = String(gradeInput).trim(); let numeric = parseFloat(raw.replace('%','')); let letter = null; if(!isNaN(numeric)){
      // clamp 0-100
      if(numeric>100) numeric = 100; if(numeric<0) numeric = 0;
      if(numeric>=90) letter='A'; else if(numeric>=80) letter='B'; else if(numeric>=70) letter='C'; else if(numeric>=60) letter='D'; else letter='F';
    } else {
      // try to normalize letter like A-, B+
      const up = raw.toUpperCase(); if(/^[ABCDF][+-]?$/.test(up)){ letter = up } else { letter = raw }
    }
    if(existing){ existing.grade = raw; if(numeric||numeric===0) existing.gradeNumeric = numeric; if(letter) existing.gradeLetter = letter; existing.date = new Date() } else { const obj = {id, grade:raw, date:new Date()}; if(numeric||numeric===0) obj.gradeNumeric = numeric; if(letter) obj.gradeLetter = letter; comps.push(obj) } saveCompletions(comps) }

  function unComplete(id){ const comps = loadCompletions(); const existing = comps.find(x=>x.id===id); if(existing){ existing.completed=false; saveCompletions(comps) } }

  // history storage (archived/completed assignments)
  function loadHistory(){ return JSON.parse(localStorage.getItem(LS_PREFIX+'history')||'[]') }
  function saveHistory(h){ localStorage.setItem(LS_PREFIX+'history', JSON.stringify(h)) }
  function moveToHistory(id){ const h = loadHistory(); const a = assignments.find(x=>x.id===id); const comps = loadCompletions(); const comp = comps.find(c=>c.id===id) || {}; if(!a) return; const entry = { id: Date.now(), originalId: a.id, course: a.course, title: a.title, due: a.due, hours: a.hours, emoji: comp.emoji||null, rating: comp.rating||null, grade: comp.grade||null, completedAt: comp.date||new Date() }; h.push(entry); saveHistory(h); renderHistory(); }
  function restoreFromHistory(entryId){ const h = loadHistory(); const idx = h.findIndex(x=>x.id===entryId); if(idx<0) return; const entry = h.splice(idx,1)[0]; saveHistory(h); // clear completion flag for original assignment
    const comps = loadCompletions(); const orig = comps.find(c=>c.id===entry.originalId); if(orig){ orig.completed=false; saveCompletions(comps) } renderHistory(); renderChecklist(); }
  function deleteHistory(entryId){ if(!confirm('Delete this history entry?')) return; const h = loadHistory().filter(x=>x.id!==entryId); saveHistory(h); renderHistory(); }

  function renderHistory(){ const ul = el('historyList'); const empty = el('historyEmpty'); if(!ul) return; const h = loadHistory(); ul.innerHTML=''; if(h.length===0){ if(empty) empty.style.display='block'; return } if(empty) empty.style.display='none'; h.slice().reverse().forEach(entry=>{ const li = document.createElement('li'); li.style.display='flex'; li.style.justifyContent='space-between'; li.style.alignItems='center'; li.innerHTML = `<div style="flex:1"><strong>${entry.course}</strong> — ${entry.title} <div style="font-size:12px;color:var(--muted)">Completed: ${new Date(entry.completedAt).toLocaleString()} ${entry.grade? ' · Grade: '+entry.grade : ''}</div></div>`; const actions = document.createElement('div'); const restore = document.createElement('button'); restore.className='btn small'; restore.textContent='Restore'; restore.onclick = ()=>{ restoreFromHistory(entry.id) }; const del = document.createElement('button'); del.className='btn small ghost'; del.textContent='Delete'; del.onclick = ()=>{ deleteHistory(entry.id) }; actions.appendChild(restore); actions.appendChild(del); li.appendChild(actions); ul.appendChild(li) }) }

  // emoji picker UI: attach to an element and call back with numeric choice 1-5
  function showEmojiPicker(anchorEl, cb){
    // remove any existing picker
    const existing = document.getElementById('emojiPicker'); if(existing) existing.remove();
    const pick = document.createElement('div'); pick.id='emojiPicker'; pick.style.position='relative'; pick.style.marginTop='6px'; pick.style.display='flex'; pick.style.gap='6px';
    const opts = [{n:1,e:'😃'},{n:2,e:'🙂'},{n:3,e:'😐'},{n:4,e:'🙁'},{n:5,e:'😟'}];
    opts.forEach(o=>{ const b = document.createElement('button'); b.className='btn small'; b.style.padding='6px'; b.textContent=o.e; b.onclick = ()=>{ pick.remove(); cb(o.n) }; pick.appendChild(b) })
    const cancel = document.createElement('button'); cancel.className='btn small ghost'; cancel.textContent='Cancel'; cancel.onclick = ()=>{ pick.remove(); cb(null) }; pick.appendChild(cancel)
    anchorEl.appendChild(pick);
  }

  function formatDate(d){return new Date(d).toLocaleDateString()}

  function generateChecklist(assigns,settings){
    // very small heuristic: sort by soonest due then by hours
    return assigns.slice().sort((a,b)=>new Date(a.due)-new Date(b.due)||b.hours-a.hours)
  }

  // basic points handling
  function givePoints(n){ const s = loadSettings(); s.points = (s.points||0)+n; saveSettings(s); syncLeaderboard(s); renderLeaderboard(); }

  // leaderboard functions
  function renderLeaderboard(){
    const board = loadBoard(); const settings = loadSettings();
    // ensure current user present
    const present = board.find(x=>x.name===settings.name)
    if(!present) board.push({name:settings.name,points:settings.points||0})
    board.sort((a,b)=>b.points-a.points)
    saveBoard(board)
    const ul = el('leaderboard'); ul.innerHTML=''
    board.slice(0,10).forEach(p=>{ const li=document.createElement('li'); li.innerHTML=`<span>${p.name}</span><strong>${p.points}</strong>`; ul.appendChild(li) })
  }

  function syncLeaderboard(settings){ const board = loadBoard(); const idx = board.findIndex(x=>x.name===settings.name); if(idx>=0) board[idx].points = settings.points; else board.push({name:settings.name,points:settings.points||0}); saveBoard(board) }

  // chat bot mini
  function addChatLine(who,text){ const log=el('chatLog'); const div=document.createElement('div'); div.className='line'; div.innerHTML=`<strong>${who}</strong>: <span>${text}</span>`; log.appendChild(div); log.scrollTop = log.scrollHeight }

  // classes storage
  function loadClasses(){ return JSON.parse(localStorage.getItem(LS_PREFIX+'classes')||'[]') }
  function saveClasses(c){ localStorage.setItem(LS_PREFIX+'classes', JSON.stringify(c)) }

  function renderClasses(){ const ul = el('classesList'); ul.innerHTML = ''; const classes = loadClasses(); classes.forEach(cl=>{ const li = document.createElement('li'); li.style.display='flex'; li.style.justifyContent='space-between'; li.style.alignItems='center'; li.innerHTML = `<span style="flex:1">${cl.name} <small style="color:var(--muted);margin-left:8px">(${cl.hours}h)</small></span>`; const actions = document.createElement('div'); const addBtn = document.createElement('button'); addBtn.className='btn small'; addBtn.textContent='Schedule'; addBtn.onclick = ()=>{ const hrs = parseFloat(prompt('Hours to schedule?', String(cl.hours)))||cl.hours; addStudyBlock(cl.name, hrs, 0); addChatLine('Assistant',`Added study block for ${cl.name} (${hrs}h)`)}; const delBtn = document.createElement('button'); delBtn.className='btn small ghost'; delBtn.textContent='Remove'; delBtn.onclick = ()=>{ if(!confirm('Remove class '+cl.name+'?')) return; const newC = loadClasses().filter(x=>x.id!==cl.id); saveClasses(newC); renderClasses() }; actions.appendChild(addBtn); actions.appendChild(delBtn); li.appendChild(actions); ul.appendChild(li) }) }

  // helper: parse HH:MM to hours float
  function parseTimeToHours(t){ if(!t) return 0; const parts = t.split(':'); return parseInt(parts[0]||'0',10) + (parseInt(parts[1]||'0',10)/60) }

  // call AI proxy (Gemini/Text-Bison) - defaults to http://localhost:3000
  async function callAI(prompt, system){
    const base = window.AI_PROXY_URL || 'http://localhost:3000';
    const url = base.replace(/\/$/, '') + '/api/ai';
    const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, system }) });
    if(!r.ok){ const txt = await r.text().catch(()=>null); throw new Error(txt||r.statusText) }
    const j = await r.json(); return j.reply || '';
  }

  async function handleChat(msg){
    addChatLine('You', msg);
    addChatLine('Assistant', 'Thinking...');
    try{
      const system = 'You are a concise study-planner assistant. Create prioritized checklist items and suggest study blocks based on deadlines.';
      const reply = await callAI(msg, system);
      addChatLine('Assistant', reply);
    }catch(err){
      console.warn('AI call failed, using fallback', err);
      let reply = "I recommend focusing on: \n";
      reply += assignments.map(a=>`• ${a.course} ${a.title} — due ${formatDate(a.due)}`).join('\n');
      reply += '\n\nSay "add [course] [hours]" to add a study block.';
      addChatLine('Assistant',reply);
    }
  }

  // simple add study block flow
  function addStudyBlock(course, hours, dayOffset=0){ const sched=loadSchedule(); const start = new Date(); start.setDate(start.getDate()+dayOffset); const end = new Date(start); end.setHours(end.getHours()+hours); sched.push({id:Date.now(),course,from:start,to:end}); saveSchedule(sched); drawCalendar(); givePoints(Math.round(hours*2)) }

  // canvas calendar (very basic week grid)
  function drawCalendar(){
    const canvas = el('calendarCanvas'); const ctx = canvas.getContext('2d'); const w=canvas.width, h=canvas.height; ctx.clearRect(0,0,w,h);
    // Only week view
    const leftMargin = 36;
    const numCols = 7;
    const colDates = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    for(let i=0;i<7;i++){ let d=new Date(today); d.setDate(today.getDate()+i); colDates.push(d); }
    const colW = (w-leftMargin)/numCols;
    const hours = 24;
    const topOffset = 20;
    const hoursH = (h-topOffset)/hours;
    ctx.fillStyle='#06111a'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
    ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.font='12px sans-serif';
    // day headers (bright)
    colDates.forEach((d,i)=>{
      ctx.fillStyle='#fff'; ctx.font='bold 13px sans-serif';
      // show date as header
      const label = d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
      ctx.fillText(label, leftMargin + i*colW+8, 14);
      ctx.strokeStyle='rgba(255,255,255,0.03)';
      ctx.strokeRect(leftMargin + i*colW, topOffset-4, colW, h-topOffset);
    });
    // hour grid lines and labels (left label column highlighted)
    ctx.font='12px sans-serif'; ctx.strokeStyle='rgba(255,255,255,0.03)';
    for(let hr=0; hr<=hours; hr++){
      const y = topOffset + hr*hoursH;
      ctx.beginPath(); ctx.moveTo(leftMargin, y); ctx.lineTo(w, y); ctx.stroke();
      // label every 2 hours to avoid clutter
      if(hr % 2 === 0){
        const label = (hr%24).toString().padStart(2,'0') + ':00';
        // draw semi-opaque background for label for contrast
        ctx.fillStyle='rgba(0,0,0,0.35)';
        ctx.fillRect(4, y-10, leftMargin-8, 18);
        // draw label in white, bold
        ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif';
        ctx.fillText(label, 8, y+4);
        ctx.font='12px sans-serif';
      }
    }
    // draw study blocks from schedule
    const sched = loadSchedule(); sched.forEach(block=>{
      const from = new Date(block.from);
      const to = new Date(block.to);
      // map date to column by exact date
      let col = -1;
      for(let i=0;i<colDates.length;i++){
        if(from.toDateString() === colDates[i].toDateString()) { col = i; break; }
      }
      if(col === -1) return;
      // map time including minutes
      const fromH = from.getHours() + from.getMinutes()/60 + from.getSeconds()/3600;
      const y = topOffset + fromH*hoursH;
      const durationHours = (to - from)/36e5;
      const hh = durationHours * hoursH;
      ctx.fillStyle='rgba(110,231,183,0.9)';
      const bx = leftMargin + col*colW + 6;
      const by = Math.max(topOffset, y);
      const bH = Math.max(8, hh);
      ctx.fillRect(bx, by, colW-12, bH);
      ctx.fillStyle='#012'; ctx.font='11px sans-serif';
      const text = block.course+' • '+(Math.round(durationHours*10)/10)+'h';
      ctx.fillText(text, bx+4, by+14);
    })
      // draw assignment deadlines as icons
    const assignmentsList = window.assignments || assignments;
    assignmentsList.forEach(a=>{
      const due = new Date(a.due);
      // map date to column by exact date
      let col = -1;
      for(let i=0;i<colDates.length;i++){
        if(due.toDateString() === colDates[i].toDateString()) { col = i; break; }
      }
      if(col === -1) return;
      // map time including minutes
      const dueH = due.getHours() + due.getMinutes()/60;
      const y = topOffset + dueH*hoursH;
      // draw a red circle with an exclamation mark
      const bx = leftMargin + col*colW + colW/2;
      const by = Math.max(topOffset+8, y);
      ctx.beginPath(); ctx.arc(bx, by, 10, 0, 2*Math.PI);
      ctx.fillStyle = '#ff7a7a'; ctx.fill();
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('!', bx, by+5);
      ctx.textAlign = 'center';
      // show assignment title centered below icon
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(a.title, bx, by+22);
    })
    // draw recurring class meetings
    const classes = loadClasses();
    if(classes && classes.length){
      // find monday of current week
      const now = new Date(); const monday = new Date(now);
      const curWd = (monday.getDay()+6)%7; monday.setDate(monday.getDate() - curWd);
      classes.forEach(cl=>{
        if(!cl.meetingDays || !cl.meetingStart) return;
        cl.meetingDays.forEach(wd=>{
          const dayDate = new Date(monday); dayDate.setDate(monday.getDate()+wd);
          const t = cl.meetingStart.split(':'); const hh = parseInt(t[0]||'0',10); const mm = parseInt(t[1]||'0',10);
          const start = new Date(dayDate); start.setHours(hh,mm,0,0);
          const end = new Date(start); end.setHours(end.getHours() + (cl.meetingDuration||1));
          // now map to canvas coords
          const fromH = start.getHours() + start.getMinutes()/60 + start.getSeconds()/3600;
          const y = topOffset + fromH*hoursH;
          const durationHours = (end - start)/36e5;
          const hhPx = durationHours * hoursH;
          const col = wd;
          const bx = leftMargin + col*colW + 6;
          const by = Math.max(topOffset, y);
          const bH = Math.max(8, hhPx);
          ctx.fillStyle='rgba(135,206,250,0.95)';
          ctx.fillRect(bx, by, colW-12, bH);
          ctx.fillStyle='#012'; ctx.font='11px sans-serif';
          ctx.fillText(cl.name+' • '+(Math.round(durationHours*10)/10)+'h', bx+4, by+14);
        })
      })
    }
  }

  // settings modal
  function openSettings(){ const s = loadSettings(); el('userName').value = s.name||''; el('userPoints').value = s.points||0; el('autoSchedule').value = s.autoSchedule===false? 'false':'true'; el('settingsModal').classList.remove('hidden') }
  function closeSettings(){ el('settingsModal').classList.add('hidden') }

  // Wire up
  function init(){
    // load default settings
    const s = loadSettings(); if(!s.name) { saveSettings(defaultUser) }
    renderChecklist(); renderLeaderboard(); drawCalendar(); renderSyllabus();

    el('regenChecklist').onclick = ()=>renderChecklist()
    el('settingsBtn').onclick = openSettings
    el('closeSettings').onclick = closeSettings
    el('saveSettings').onclick = ()=>{ const newS = {name:el('userName').value||'You',points:parseInt(el('userPoints').value||'0',10)||0,autoSchedule:el('autoSchedule').value==='true'}; saveSettings(newS); syncLeaderboard(newS); renderLeaderboard(); closeSettings() }
    el('joinLeaderboard').onclick = ()=>{ const s=loadSettings(); syncLeaderboard(s); renderLeaderboard(); addChatLine('System','Joined leaderboard as '+s.name) }
    el('chatForm').onsubmit = e=>{ e.preventDefault(); const v=el('chatInput').value.trim(); if(!v) return; handleChat(v); el('chatInput').value=''}
    el('addStudyBtn').onclick = ()=>{ const course = prompt('Course name?','Self-Study'); const hours = parseFloat(prompt('Hours?','1'))||1; addStudyBlock(course,hours,0) }
    // ICS import
    const icsBtn = el('importIcsBtn'), icsFile = el('icsFile');
    if(icsBtn && icsFile){
      icsBtn.onclick = ()=>{ icsFile.click() }
      icsFile.onchange = e=>{ if(e.target.files && e.target.files[0]) handleIcsFile(e.target.files[0]) }
    }
    // auto-import default ICS on first load
    tryFetchDefaultIcs()
    // classes handlers
    el('addClassBtn').onclick = ()=>{
      const name = el('className').value.trim();
      const hrs = parseFloat(el('classHours').value)||1;
      if(!name) return alert('Provide a class name');
      // collect meeting days
      const dayChecks = Array.from(document.querySelectorAll('#classesList, section.panel input[type=checkbox][data-day], #className')).filter(()=>true)
      const dayBoxes = Array.from(document.querySelectorAll('input[type="checkbox"][data-day]'))
      const meetingDays = dayBoxes.filter(cb=>cb.checked).map(cb=>parseInt(cb.getAttribute('data-day'),10))
      const start = el('classStart').value || '';
      const duration = parseFloat(el('classDuration').value) || 1;
      const classes = loadClasses();
      classes.push({id:Date.now(),name, hours:hrs, meetingDays, meetingStart:start, meetingDuration:duration});
      saveClasses(classes);
      el('className').value=''; el('classHours').value=''; el('classStart').value=''; el('classDuration').value=''; dayBoxes.forEach(cb=>cb.checked=false);
      renderClasses(); addChatLine('System',`Added class ${name}`)
    }
    el('clearClasses').onclick = ()=>{ if(!confirm('Clear all classes?')) return; saveClasses([]); renderClasses() }
    const ch = el('clearHistory'); if(ch) ch.onclick = ()=>{ if(!confirm('Clear history?')) return; saveHistory([]); renderHistory() }
    // allow chat quick add: if user types "add XYZ 2" we'll parse
    // simple parser
    document.addEventListener('keydown', e=>{ if(e.key==='Enter'&&e.ctrlKey){ const v=el('chatInput').value.trim(); if(v.startsWith('add ')){ const parts=v.split(' '); const course=parts[1]||'Study'; const hours=parseFloat(parts[2])||1; addStudyBlock(course,hours,0); addChatLine('Assistant',`Added study block ${course} (${hours}h)`); el('chatInput').value='' } } })
    // render classes initially
    renderClasses();
    renderHistory();
  }


  function renderSyllabus(){ const p = `Generated syllabus summary:\n\n` + assignments.map(a=>`${a.course}: ${a.title} — due ${formatDate(a.due)} (est ${a.hours}h)`).join('\n'); el('syllabus').textContent = p }

  async function analyzeGrades(){
    const comps = loadCompletions();
    const entries = comps.filter(c=>c.grade!=null);
    const byCourse = {};
    entries.forEach(e=>{
      const a = assignments.find(x=>x.id===e.id); if(!a) return;
      const c = a.course;
      const num = parseFloat(String(e.grade).replace('%',''));
      if(isNaN(num)) return;
      if(!byCourse[c]) byCourse[c] = {sum:0,count:0};
      byCourse[c].sum += num; byCourse[c].count++
    })
    const results = Object.keys(byCourse).map(c=>({course:c,avg: byCourse[c].sum/byCourse[c].count}))
    if(results.length===0){ addChatLine('Assistant','No numeric grades found. Please add numeric grades (e.g. 92) for assignments to analyze.'); return }
    results.sort((a,b)=>b.avg-a.avg)
    const best = results.slice(0,3).map(r=>`${r.course}: ${Math.round(r.avg*10)/10}`).join('\n')
    const worst = results.slice(-3).reverse().map(r=>`${r.course}: ${Math.round(r.avg*10)/10}`).join('\n')
    let summary = `Grade summary:\n\nTop strengths:\n${best}\n\nAreas to improve:\n${worst}`
    addChatLine('Assistant', summary)
    // try AI for a richer analysis if available
    try{
      const prompt = `I have the following course averages:\n${results.map(r=>r.course+': '+Math.round(r.avg*10)/10).join('\n')}\n\nProvide a short analysis of strengths and weaknesses and recommend study focus and scheduling suggestions.`
      const system = 'You are an academic performance analyst. Be concise.'
      const ai = await callAI(prompt, system)
      if(ai) addChatLine('Assistant', ai)
    }catch(err){ console.warn('AI analyze failed', err) }
  }

  // --- ICS import utilities ---
  function parseICSDatetime(val){
    // supports YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or DATE only
    if(!val) return null;
    const m = val.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/) || [];
    if(m.length>=4){ const y=+m[1],mo=+m[2]-1,d=+m[3],hh=+(m[4]||0),mm=+(m[5]||0),ss=+(m[6]||0); return new Date(Date.UTC(y,mo,d,hh,mm,ss)) }
    return null;
  }

  function bydayToIndex(day){ const map={MO:0,TU:1,WE:2,TH:3,FR:4,SA:5,SU:6}; return map[day] }

  function importICSContent(text){
    const vevents = text.split(/BEGIN:VEVENT/i).slice(1);
    const classesAdded = [];
    vevents.forEach(block=>{
      const lines = block.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const obj = {};
      lines.forEach(l=>{ const [k,v] = l.split(':',2); if(!k) return; const key = k.split(';')[0].toUpperCase(); if(!obj[key]) obj[key]=v; else obj[key]+= '\n'+v });
      const summary = obj['SUMMARY']||''; const uid = obj['UID']||''; const rrule = obj['RRULE']||''; const dtstart = obj['DTSTART']||obj['DTSTART;VALUE=DATE']||''; const dtend = obj['DTEND']||'';
      // Heuristic: skip assignments (UID containing assignment or SUMMARY containing 'Assignment' or 'Due')
      if(/assignment|due|deadline/i.test(summary+uid)) return;
      // If RRULE weekly or BYDAY present, treat as recurring class meeting
      let meetingDays = [];
      if(rrule){ const m = rrule.match(/BYDAY=([^;]+)/); if(m){ meetingDays = m[1].split(',').map(x=>bydayToIndex(x)) }
        else if(/FREQ=WEEKLY/i.test(rrule)){
          // fallback: use DTSTART weekday
          const dt = parseICSDatetime(dtstart); if(dt) meetingDays = [ (dt.getUTCDay()+6)%7 ]
        }
      }
      // if no RRULE but DTSTART has time, consider a one-off class (still add)
      if(meetingDays.length===0){ const dt = parseICSDatetime(dtstart); if(dt){ meetingDays = [ (dt.getUTCDay()+6)%7 ] } }
      if(meetingDays.length===0) return;
      // determine start time and duration
      const dt = parseICSDatetime(dtstart); const dt2 = parseICSDatetime(dtend);
      let meetingStart = '';
      let meetingDuration = 1;
      if(dt){ const hh = dt.getUTCHours().toString().padStart(2,'0'); const mm = dt.getUTCMinutes().toString().padStart(2,'0'); meetingStart = hh+':'+mm }
      if(dt && dt2){ meetingDuration = Math.max(0.25, (dt2 - dt)/36e5) }
      // derive a class name from summary (take first token like ABC-123 or ABC123 or first word)
      const nameMatch = summary.match(/([A-Z]{2,}\s?-?\s?\d{2,})|([A-Z]{2,}\d{2,})/);
      const className = (nameMatch && nameMatch[0]) ? nameMatch[0].replace(/\s+/g,'') : summary.split(/\-|\(|:/)[0].trim().substring(0,20);
      const classes = loadClasses();
      // avoid duplicates by course+start+days
      const exists = classes.find(c=>c.name===className && c.meetingStart===meetingStart && JSON.stringify(c.meetingDays)===JSON.stringify(meetingDays));
      if(!exists){ classes.push({id:Date.now()+Math.random(), name:className||summary.substring(0,20), hours:meetingDuration, meetingDays, meetingStart, meetingDuration}); saveClasses(classes); classesAdded.push(className) }
    })
    if(classesAdded.length) {
      renderClasses(); drawCalendar(); addChatLine('System',`Imported ${classesAdded.length} classes from ICS`)
    } else addChatLine('System','No recurring class meetings found in ICS')
  }

  // wire up import button and file input
  function handleIcsFile(file){ const reader = new FileReader(); reader.onload = e=>{ importICSContent(e.target.result) }; reader.readAsText(file) }
  async function tryFetchDefaultIcs(){ try{ const r = await fetch('./imported.ics'); if(r.ok){ const txt = await r.text(); importICSContent(txt); return true } }catch(e){} return false }

  // initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init)

})();
