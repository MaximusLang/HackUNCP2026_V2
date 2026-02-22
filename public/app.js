let assignments = [];
let selectedAssignment = null;

async function loadData() {
    await loadAssignments();
}

async function loadAssignments() {
    const res = await fetch('/api/assignments');
    assignments = await res.json();
    renderAll();
}

async function loadCourses() {
    const res = await fetch('/api/courses');
    const courses = await res.json();
    renderCourses(courses);
}

function renderAll() {
    renderCurrent();
    renderToBeGraded();
    renderHistory();
    updateOverview();
}

function updateOverview() {
    const history = assignments.filter(a => a.status === 'history');
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const lastWeekAccomplished = history.filter(a => a.completedAt && new Date(a.completedAt) > oneWeekAgo);
    let totalGrade = 0, gradeCount = 0;
    lastWeekAccomplished.forEach(a => {
        if (!isNaN(parseFloat(a.grade))) { totalGrade += parseFloat(a.grade); gradeCount++; }
    });
    document.getElementById('statAccomplished').innerText = `${lastWeekAccomplished.length} done`;
    document.getElementById('statAvgGrade').innerText = gradeCount > 0 ? (totalGrade / gradeCount).toFixed(1) : "N/A";
    const total = assignments.length;
    document.getElementById('progressFill').style.width = `${total > 0 ? (history.length / total) * 100 : 0}%`;
}

function renderCurrent() {
    const container = document.getElementById('currentAssignments');
    container.innerHTML = "";
    assignments.filter(a => a.status === "current")
        .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
        .forEach(a => {
            const card = document.createElement('div');
            card.className = "card";
            if (a.priorityScore > 70 || (a.end && new Date(a.end) < new Date())) card.style.borderLeft = "5px solid #ff4444";
            card.innerHTML = `
                <input type="checkbox" class="complete-checkbox" />
                <div class="card-content">
                    <strong>${a.summary}</strong>
                    <p style="font-size:0.8em; color:#888;">${a.courseId ? a.courseId.courseName : 'Unassigned'}</p>
                    <p>Due: ${a.end ? new Date(a.end).toLocaleDateString() : "N/A"}</p>
                    ${a.priorityScore ? `<span style="font-size:0.7em; color:#ffaa00;">Priority: ${a.priorityScore}</span>` : ''}
                </div>
            `;
            card.onclick = () => openDetails(a);
            const checkbox = card.querySelector(".complete-checkbox");
            checkbox.onclick = (e) => { e.stopPropagation(); openCompletion(a); checkbox.checked = false; };
            container.appendChild(card);
        });
}

function renderToBeGraded() {
    const container = document.getElementById('toBeGraded');
    container.innerHTML = "";
    assignments.filter(a => a.status === "toBeGraded").forEach(a => {
        const card = document.createElement('div');
        card.className = "card";
        card.innerHTML = `
            <div class="card-content">
                <strong>${a.summary}</strong>
                <div style="margin-top:10px">
                    <input type="text" placeholder="Grade" style="width: 60px" />
                    <button class="save-grade-btn">Save</button>
                </div>
            </div>
        `;
        card.querySelector(".save-grade-btn").onclick = async () => {
            const g = card.querySelector("input").value;
            if (!g) return alert("Enter grade");
            a.grade = parseFloat(g); a.status = "history"; a.completedAt = new Date();
            await updateAssignment(a); loadAssignments();
        };
        container.appendChild(card);
    });
}

function renderHistory() {
    const container = document.getElementById('history');
    container.innerHTML = "";
    assignments.filter(a => a.status === "history").forEach(a => {
        const card = document.createElement('div');
        card.className = "card history";
        card.innerHTML = `<div class="card-content"><strong>${a.summary}</strong><p>Grade: ${a.grade || "N/A"}</p></div>`;
        container.appendChild(card);
    });
}

function renderCourses(courses) {
    const container = document.getElementById('courseList');
    container.innerHTML = courses.map(c => `
        <div class="card" style="padding: 10px; margin-bottom: 5px;">
            <div class="card-content">
                <strong style="font-size:0.9em">${c.courseName}</strong>
                <p style="font-size:0.7em">${c.syllabusFileName ? '✅ Syllabus OK' : '❌ No Syllabus'}</p>
            </div>
            <input type="file" class="syllabus-file" style="display:none" data-id="${c._id}" />
            <button class="upload-syllabus-btn" data-id="${c._id}" title="Upload Syllabus">📄</button>
        </div>
    `).join('');
    container.querySelectorAll('.upload-syllabus-btn').forEach(btn => {
        btn.onclick = () => container.querySelector(`.syllabus-file[data-id="${btn.dataset.id}"]`).click();
    });
    container.querySelectorAll('.syllabus-file').forEach(input => {
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            const formData = new FormData(); formData.append('syllabus', file); formData.append('courseId', input.dataset.id);
            alert("Analyzing syllabus with AI...");
            const res = await fetch('/api/upload-syllabus', { method: "POST", body: formData });
            const data = await res.json();
            if (data.success) { alert("Syllabus parsed!"); loadCourses(); }
        };
    });
}

async function checkOverdue() {
    try {
        const res = await fetch('/api/assignments/overdue');
        const overdue = await res.json();
        if (overdue && overdue.length > 0) {
            const list = document.getElementById('overdueList');
            list.innerHTML = "";
            overdue.forEach(a => {
                const item = document.createElement('div');
                item.className = "card"; item.style.flexDirection = "column"; item.style.borderLeft = "5px solid #ff4444";
                item.innerHTML = `
                    <strong>${a.summary}</strong>
                    <div style="display:flex; gap:10px; margin-top:10px; width:100%;">
                        <div style="flex:1">
                            <label style="font-size:0.7em">New Due Date:</label>
                            <input type="date" class="new-date-input" style="width:100%" />
                            <button class="keep-btn" style="width:100%; background:#4caf50; margin-top:5px;">Keep</button>
                        </div>
                        <div style="flex:1; display:flex; align-items:flex-end;">
                            <button class="fail-btn" style="width:100%; background:#ff4444;">Fail (0)</button>
                        </div>
                    </div>
                `;
                item.querySelector(".keep-btn").onclick = async () => {
                    const d = item.querySelector(".new-date-input").value;
                    if (!d) return alert("Select date");
                    await fetch(`/api/assignments/${a._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ end: new Date(d) }) });
                    checkOverdue(); loadAssignments();
                };
                item.querySelector(".fail-btn").onclick = async () => {
                    await fetch(`/api/assignments/${a._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: 'history', grade: 0 }) });
                    checkOverdue(); loadAssignments();
                };
                list.appendChild(item);
            });
            document.getElementById('overdueModal').classList.add('active');
        } else { document.getElementById('overdueModal').classList.remove('active'); }
    } catch (err) { console.error(err); }
}

function openDetails(a) {
    document.getElementById("detailsTitle").innerText = a.summary;
    document.getElementById("detailsBody").innerText = a.description || "No description.";
    document.getElementById("detailsMeta").innerHTML = `<strong>Location:</strong> ${a.location || 'N/A'}<br><strong>UID:</strong> ${a.uid}`;
    document.getElementById("detailsModal").classList.add("active");
}

function openCompletion(a) {
    selectedAssignment = a;
    document.getElementById("completionTitle").innerText = a.summary;
    document.getElementById("completionModal").classList.add("active");
}

document.getElementById("saveCompletion").onclick = async () => {
    selectedAssignment.status = "toBeGraded";
    selectedAssignment.difficulty = parseInt(document.getElementById("difficultyInput").value);
    selectedAssignment.confidence = parseInt(document.getElementById("confidenceInput").value);
    await updateAssignment(selectedAssignment);
    document.getElementById("completionModal").classList.remove("active");
    loadAssignments();
};

document.getElementById("closeCompletion").onclick = () => document.getElementById("completionModal").classList.remove("active");
document.getElementById("closeDetails").onclick = () => document.getElementById("detailsModal").classList.remove("active");
document.getElementById("closeOverdue").onclick = () => document.getElementById("overdueModal").classList.remove("active");
document.getElementById("acknowledgeOverdue").onclick = () => document.getElementById("overdueModal").classList.remove("active");
document.getElementById("closeOverdue").onclick = () => {
    const list = document.getElementById('overdueList');
    if (list && list.children && list.children.length > 0) {
        alert('Please resolve all overdue items before closing.');
        return;
    }
    document.getElementById('overdueModal').classList.remove('active');
};

document.getElementById("acknowledgeOverdue").onclick = () => {
    const list = document.getElementById('overdueList');
    if (list && list.children && list.children.length > 0) {
        alert('Please resolve all overdue items before acknowledging.');
        return;
    }
    document.getElementById("overdueModal").classList.remove("active");
};

// Prevent closing with Escape while overdue items remain
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('overdueModal');
        if (modal && modal.classList.contains('active')) {
            const list = document.getElementById('overdueList');
            if (list && list.children && list.children.length > 0) {
                e.preventDefault();
                alert('Resolve all overdue items before closing the overdue dialog.');
            }
        }
    }
});

// Syllabus upload (single, AI-detected course)
document.getElementById("uploadSyllabusBtn").onclick = async () => {
    const input = document.getElementById('syllabusUpload');
    const file = input.files[0];
    if (!file) return alert('Select a syllabus file');
    const formData = new FormData(); formData.append('syllabus', file);
    try {
        document.getElementById('uploadedCourseInfo').innerText = 'Analyzing syllabus...';
        const res = await fetch('/api/upload-syllabus', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            const courseName = data.course && data.course.courseName ? data.course.courseName : 'Unknown';
            const weights = data.weights || {};
            document.getElementById('uploadedCourseInfo').innerText = `Detected: ${courseName} — Weights: ${JSON.stringify(weights)}`;
            loadAssignments();
        } else {
            document.getElementById('uploadedCourseInfo').innerText = 'Parse failed';
        }
    } catch (err) { console.error(err); document.getElementById('uploadedCourseInfo').innerText = 'Error uploading syllabus'; }
};

document.getElementById("uploadBtn").onclick = async () => {
    const fileInput = document.getElementById("icsUpload");
    const file = fileInput.files[0];
    if (!file) return alert("Select file");
    const formData = new FormData(); formData.append("icsFile", file);
    try {
        const res = await fetch('/api/upload-ics', { method: "POST", body: formData });
        const result = await res.json();
        if (result.success) alert(`Processed ${result.count} events.`);
    } catch (err) { console.error(err); }
    loadAssignments();
};

document.getElementById("chatSend").onclick = async () => {
    const input = document.getElementById("chatInput");
    const message = input.value.trim();
    if (!message) return;
    appendChatMessage("User", message); input.value = "";
    try {
        const res = await fetch('/api/chat', { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
        const data = await res.json();
        appendChatMessage("AI", data.response);
        loadAssignments();
    } catch (err) { appendChatMessage("System", "AI Error"); }
};

function appendChatMessage(sender, text) {
    const window = document.getElementById("chatWindow");
    const p = document.createElement("p");
    p.style.margin = "5px 0";
    p.innerHTML = `<strong style="color: #4caf50">${sender}:</strong> ${text}`;
    window.appendChild(p); window.scrollTop = window.scrollHeight;
}

async function updateAssignment(a) {
    await fetch(`/api/assignments/${a._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
}

window.onload = async () => { await loadData(); checkOverdue(); setInterval(checkOverdue, 60000); };
