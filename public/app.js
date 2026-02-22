let assignments = [];
let selectedAssignment = null;

async function loadAssignments() {
    const res = await fetch('/api/assignments');
    assignments = await res.json();
    renderAll();
}

function renderAll() {
    renderCurrent();
    renderToBeGraded();
    renderHistory();
}

function renderCurrent() {
    const container = document.getElementById('currentAssignments');
    container.innerHTML = "";

    assignments.filter(a => a.status === "current")
        .forEach(a => {

            const card = document.createElement('div');
            card.className = "card";

            card.innerHTML = `
                <strong>${a.summary}</strong>
                <p>Due: ${a.end ? new Date(a.end).toLocaleDateString() : "N/A"}</p>
                <button class="complete-btn">✓</button>
            `;

            card.querySelector(".complete-btn").onclick = () => openCompletion(a);
            container.appendChild(card);
        });
}

function renderToBeGraded() {
    const container = document.getElementById('toBeGraded');
    container.innerHTML = "";

    assignments.filter(a => a.status === "toBeGraded")
        .forEach(a => {

            const card = document.createElement('div');
            card.className = "card";

            card.innerHTML = `
                <strong>${a.summary}</strong>
                <input type="number" placeholder="Grade" />
                <button>Save</button>
            `;

            card.querySelector("button").onclick = async () => {
                const grade = card.querySelector("input").value;

                a.grade = grade;
                a.status = "history";
                a.completedAt = new Date();

                await updateAssignment(a);
                loadAssignments();
            };

            container.appendChild(card);
        });
}

function renderHistory() {
    const container = document.getElementById('history');
    container.innerHTML = "";

    assignments.filter(a => a.status === "history")
        .forEach(a => {
            const card = document.createElement('div');
            card.className = "card history";

            card.innerHTML = `
                <strong>${a.summary}</strong>
                <p>Grade: ${a.grade || "N/A"}</p>
            `;

            container.appendChild(card);
        });
}

function openCompletion(a) {
    selectedAssignment = a;
    document.getElementById("completionTitle").innerText = a.summary;
    document.getElementById("completionModal").classList.add("active");
}

document.getElementById("saveCompletion").onclick = async () => {
    selectedAssignment.status = "toBeGraded";
    selectedAssignment.difficulty = document.getElementById("difficultyInput").value;
    selectedAssignment.confidence = document.getElementById("confidenceInput").value;

    await updateAssignment(selectedAssignment);

    document.getElementById("completionModal").classList.remove("active");
    loadAssignments();
};

document.getElementById("closeCompletion").onclick = () => {
    document.getElementById("completionModal").classList.remove("active");
};

document.getElementById("uploadBtn").onclick = async () => {
    const fileInput = document.getElementById("icsUpload");
    const file = fileInput.files[0];

    if (!file) return alert("Select a file.");

    const formData = new FormData();
    formData.append("icsFile", file);

    await fetch('/api/upload-ics', {
        method: "POST",
        body: formData
    });

    loadAssignments();
};

async function updateAssignment(a) {
    await fetch(`/api/assignments/${a._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a)
    });
}

window.onload = loadAssignments;