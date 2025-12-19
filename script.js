// ==================== AUTH CHECK ====================
const API_URL = 'https://apartment-api-3jnu.onrender.com/api';

// State Management
let buildingState = [];
let currentRoomId = null;
let invoices = []; // Dữ liệu hóa đơn

// Check authentication on page load
(function checkAuth() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');

    if (!token || !user) {
        // Redirect to login if not authenticated
        window.location.href = 'login.html';
        return;
    }

    // Verify token with server
    fetch(`${API_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html';
            } else {
                // Check Role - Protect Admin Route
                const userData = data.user;
                if (userData.role !== 'admin') {
                    window.location.href = 'user_view.html';
                    return;
                }

                // Update user name in header
                localStorage.setItem('currentUser', JSON.stringify(userData)); // Update local storage
                document.getElementById('user-name').textContent = userData.name || 'Admin';
            }
        })
        .catch(() => {
            // If server is not available, still allow access with stored token
            const userData = JSON.parse(user);
            document.getElementById('user-name').textContent = userData.name || 'Người dùng';
        });
})();

// Handle Logout
function handleLogout() {
    document.getElementById('logout-confirm-modal').classList.remove('hidden');
}

// Setup Logout Modal
setTimeout(() => {
    const logoutModal = document.getElementById('logout-confirm-modal');
    if (logoutModal) {
        document.getElementById('btn-cancel-logout').onclick = () => {
            logoutModal.classList.add('hidden');
        };

        document.getElementById('btn-confirm-logout').onclick = () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        };

        logoutModal.onclick = (e) => {
            if (e.target === logoutModal) {
                logoutModal.classList.add('hidden');
            }
        };
    }
}, 100);

// ==================== BUILDING CONFIG ====================
// Configuration for the building structure
const FLOOR_CONFIG = [
    { floor: 7, rooms: 3 },
    { floor: 6, rooms: 4 },
    { floor: 5, rooms: 4 },
    { floor: 4, rooms: 4 },
    { floor: 3, rooms: 4 },
    { floor: 2, rooms: 2 },
    { floor: 1, type: 'parking' }
];


// Initialize Data
// Function to fetch data from Server
async function fetchDataFromServer() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const response = await fetch(`${API_URL}/apartments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            console.log("Loaded data from Server:", data.data);
            localStorage.setItem('buildingResidentData', JSON.stringify(data.data)); // Backup to local

            // Merge Data
            data.data.forEach(savedItem => {
                const room = buildingState.find(r => r.id === savedItem.id);
                if (room && savedItem.residents) {
                    room.residents = savedItem.residents;
                }
            });
            // Update UI after fetch
            updateStats();
            renderBuilding();
            checkPendingUsers(); // Also check for unassigned users
        }
    } catch (error) {
        console.error("Lỗi tải dữ liệu từ server:", error);
    }
}

// Function to save data to Server AND LocalStorage
async function saveData() {
    // Prepare data
    const dataToSave = buildingState
        .filter(item => item.type === 'room')
        .map(room => ({
            id: room.id,
            residents: room.residents
        }));

    // 1. Save Local (Backup & Fast UI)
    localStorage.setItem('buildingResidentData', JSON.stringify(dataToSave));
    localStorage.setItem('apartmentData', JSON.stringify(buildingState)); // For user_view.html

    // 2. Save Server
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            console.log("Saving to Server...");
            await fetch(`${API_URL}/apartments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ data: dataToSave })
            });
            console.log("Saved to Server success!");
            checkPendingUsers(); // Refresh pending list after assign

            // Re-load invoices to ensure data is synced
            loadInvoices();
        }
    } catch (e) {
        console.warn("Không thể lưu lên server (Offline?)", e);
    }
}

function initData() {
    // Initialize Floors and Rooms Structure
    FLOOR_CONFIG.forEach(config => {
        if (config.type === 'parking') {
            buildingState.push({
                id: 'parking',
                floor: config.floor,
                number: 'Parking',
                type: 'parking',
                residents: []
            });
        } else {
            for (let i = 1; i <= config.rooms; i++) {
                buildingState.push({
                    id: `${config.floor}0${i}`,
                    floor: config.floor,
                    number: `${config.floor}0${i}`,
                    type: 'room',
                    residents: []
                });
            }
        }
    });

    // Initial Load: Try LocalStorage first for instant render
    const savedData = localStorage.getItem('buildingResidentData');
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            parsedData.forEach(savedItem => {
                const room = buildingState.find(r => r.id === savedItem.id);
                if (room && savedItem.residents) {
                    room.residents = savedItem.residents;
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    // Then Fetch from Server in background
    fetchDataFromServer();

    // Populate room selection dropdowns
    populateRoomSelects();
}

function populateRoomSelects() {
    const selects = ['inp-room-id', 'inv-room-id'];
    const rooms = buildingState.filter(item => item.type === 'room');

    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">-- Chọn phòng --</option>';
            rooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room.id;
                opt.textContent = `Phòng ${room.id}`;
                select.appendChild(opt);
            });
        }
    });
}
// Stats Calculation
function updateStats() {
    // Total Residents Count
    let totalResidents = 0;
    let occupiedRooms = 0;
    let vacantRooms = 0;
    let totalBikes = 0;

    buildingState.forEach(item => {
        if (item.type === 'room') {
            const count = item.residents.length;
            totalResidents += count;
            if (count > 0) {
                occupiedRooms++;
            } else {
                vacantRooms++;
            }
            // Count bikes in this room
            totalBikes += item.residents.filter(r => r.plate && r.plate.trim() !== '').length;
        }
    });

    // Update Stats UI
    if (document.getElementById('total-residents')) document.getElementById('total-residents').textContent = totalResidents;
    if (document.getElementById('vacant-rooms')) document.getElementById('vacant-rooms').textContent = vacantRooms;
    if (document.getElementById('occupied-rooms')) document.getElementById('occupied-rooms').textContent = occupiedRooms;

    const bikeStat = document.getElementById('total-bikes');
    if (bikeStat) bikeStat.textContent = totalBikes;

    // Animate numbers simple effect
    animateValue('total-residents', 0, totalResidents, 500);
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Get all plates from all rooms
function getAllPlates() {
    const plates = [];
    const rooms = buildingState.filter(item => item.type === 'room');

    rooms.forEach(room => {
        room.residents.forEach(resident => {
            if (resident.plate && resident.plate.trim() !== '') {
                plates.push({
                    plate: resident.plate,
                    room: room.number,
                    owner: resident.name
                });
            }
        });
    });

    return plates;
}

// Render Building
function renderBuilding() {
    const container = document.getElementById('building-diagram');
    container.innerHTML = ''; // Clear current

    FLOOR_CONFIG.forEach(config => {
        const floorDiv = document.createElement('div');
        floorDiv.className = 'floor-container';

        // Floor Label
        const label = document.createElement('div');
        label.className = 'floor-label';
        label.textContent = config.floor === 1 ? 'Tầng 1' : `Tầng ${config.floor}`;
        floorDiv.appendChild(label);

        // Rooms Container
        const roomsGrid = document.createElement('div');
        roomsGrid.className = 'rooms-grid';

        if (config.type === 'parking') {
            // Get all plates from all rooms
            const allPlates = getAllPlates();
            const parkingCard = document.createElement('div');
            parkingCard.className = 'room-card parking clickable';
            parkingCard.onclick = () => window.openParkingModal();

            parkingCard.innerHTML = `
                <div class="room-number"><i class="fa-solid fa-motorcycle"></i> Khu Vực Để Xe</div>
                <div class="bike-count">
                    <i class="fa-solid fa-motorcycle"></i> <strong>${allPlates.length}</strong> xe
                </div>
            `;
            roomsGrid.appendChild(parkingCard);
        } else {
            // Find rooms for this floor
            const rooms = buildingState.filter(r => r.floor === config.floor && r.type === 'room');

            rooms.forEach(room => {
                const card = document.createElement('div');
                const residentCount = room.residents.length;
                const isOccupied = residentCount > 0;
                card.className = `room-card ${isOccupied ? 'occupied' : 'vacant'}`;
                card.onclick = () => openModal(room.id);

                card.innerHTML = `
                    <div class="room-number">P.${room.number}</div>
                    <div class="resident-count">
                        <i class="fa-solid fa-user"></i> ${residentCount} người
                    </div>
                `;
                roomsGrid.appendChild(card);
            });
        }

        floorDiv.appendChild(roomsGrid);
        container.appendChild(floorDiv);
    });
}

// Modal Logic
const modal = document.getElementById('room-modal');
const closeModalBtn = document.querySelector('.close-modal');
const addForm = document.getElementById('add-resident-form');
const residentListEl = document.getElementById('modal-resident-list');

const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
const isAdmin = currentUser.role === 'admin';

function openModal(roomId) {
    currentRoomId = roomId;
    const room = buildingState.find(r => r.id === roomId);
    if (!room) return;

    // Update Header Info
    document.getElementById('modal-room-title').textContent = `Phòng ${room.number}`;

    // Status Badge
    const statusEl = document.getElementById('modal-status');
    if (room.residents.length > 0) {
        statusEl.textContent = 'Đã cho thuê';
        statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
        statusEl.style.color = '#ef4444';
    } else {
        statusEl.textContent = 'Còn trống';
        statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
        statusEl.style.color = '#10b981';
    }

    // Role-based visibility for Add Form
    const addSection = document.querySelector('#room-modal .add-resident-section');
    if (addSection) {
        addSection.style.display = isAdmin ? 'block' : 'none';
    }

    renderResidentList(room.residents);
    modal.classList.remove('hidden');

    // Auto-fill if we are in "Pending Assignment" mode
    if (window.pendingAssignUser) {
        const inpName = document.getElementById('inp-name');
        const inpPhone = document.getElementById('inp-phone-login');
        if (inpName) inpName.value = window.pendingAssignUser.name;
        if (inpPhone) inpPhone.value = window.pendingAssignUser.phone;

        // Focus on the next logical field if possible
        const inpDob = document.getElementById('inp-dob');
        if (inpDob) inpDob.focus();

        // Clear the state after pre-filling to prevent accidental fills later
        window.pendingAssignUser = null;
    }
}

function renderResidentList(residents) {
    document.getElementById('resident-count-display').textContent = residents.length;
    residentListEl.innerHTML = '';

    if (residents.length === 0) {
        residentListEl.innerHTML = '<li class="empty-message">Chưa có cư dân nào</li>';
        return;
    }

    residents.forEach((resident, index) => {
        const li = document.createElement('li');
        // Chỉ thêm class clickable nếu là admin (để sửa)
        li.className = `resident-item ${isAdmin ? 'clickable' : ''}`;
        const plateInfo = resident.plate ? `<span class="plate-badge"><i class="fa-solid fa-motorcycle"></i> ${resident.plate}</span>` : '';

        // Show/Hide buttons based on role
        const actionsHtml = isAdmin ? `
            <div class="resident-actions">
                <button class="btn-edit" onclick="event.stopPropagation(); openEditModal(${index})" title="Sửa">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); removeResident(${index})" title="Xoá">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        li.innerHTML = `
            <div class="resident-info">
                <h4>${resident.name}</h4>
                <div class="resident-details">
                    <span>${resident.gender}</span>
                    <span>${new Date(resident.dob).getFullYear()}</span>
                    <span>${resident.job}</span>
                    ${plateInfo}
                </div>
            </div>
            ${actionsHtml}
        `;

        // Click vào cư dân cũng mở modal sửa (chỉ cho admin)
        if (isAdmin) {
            li.onclick = () => openEditModal(index);
        }

        residentListEl.appendChild(li);
    });
}

function closeModal() {
    modal.classList.add('hidden');
    currentRoomId = null;
    addForm.reset(); // Clear form on close
}

closeModalBtn.onclick = closeModal;
window.onclick = (e) => {
    if (e.target === modal) closeModal();
};

// Setup Account Success Modal Close
const accSuccessModal = document.getElementById('account-success-modal');
const closeAccModal = () => {
    accSuccessModal.classList.add('hidden');
    accSuccessModal.style.display = 'none'; // Force hide
};
document.getElementById('btn-close-account-modal').onclick = closeAccModal;
accSuccessModal.onclick = (e) => {
    if (e.target === accSuccessModal) closeAccModal();
};

// Form Submission - HANDLER
function setupAddResidentHandler() {
    const form = document.getElementById('add-resident-form');
    const btn = document.getElementById('btn-trigger-add');

    if (!form || !btn) {
        console.error("Form or Button not found in DOM!");
        return;
    }

    // Use form submit event instead of button click to handle "Enter" key
    form.onsubmit = async (e) => {
        e.preventDefault();
        console.log("=== ADD RESIDENT SUBMITTED ===");

        try {
            if (!currentRoomId) {
                alert("Vui lòng chọn một phòng trước khi thêm!");
                return;
            }

            const room = buildingState.find(r => r.id === currentRoomId);
            if (!room) {
                alert("Lỗi: Không tìm thấy dữ liệu phòng " + currentRoomId);
                return;
            }

            // Get Form Data
            const nameInput = document.getElementById('inp-name');
            const phoneInput = document.getElementById('inp-phone-login');
            const dobInput = document.getElementById('inp-dob');
            const genderInput = document.getElementById('inp-gender');
            const emailInput = document.getElementById('inp-email');
            const hometownInput = document.getElementById('inp-hometown');
            const jobInput = document.getElementById('inp-job');
            const cccdInput = document.getElementById('inp-cccd');
            const plateInput = document.getElementById('inp-plate');

            const name = nameInput.value.trim();
            // Clean phone number: remove spaces, dots, hyphens
            const rawPhone = phoneInput.value.trim();
            const phone = rawPhone.replace(/[\s\.\-]/g, '');

            // Validation
            if (!name) return alert("Vui lòng nhập tên cư dân!");
            if (!phone) return alert("Vui lòng nhập số điện thoại!");
            if (!/^[0-9]{10,11}$/.test(phone)) {
                return alert("Số điện thoại không hợp lệ! Vui lòng nhập 10-11 chữ số.");
            }

            // Duplication check
            const phoneExists = buildingState.some(r =>
                r.residents && r.residents.some(res => {
                    const existingPhone = (res.phoneLogin || "").replace(/[\s\.\-]/g, '');
                    return existingPhone === phone;
                })
            );

            if (phoneExists) {
                return alert("Số điện thoại này đã tồn tại ở một phòng khác!");
            }

            // Disable button during save
            const originalBtnText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang xử lý...';

            // Create Object
            const newRes = {
                id: Date.now().toString(),
                name,
                phoneLogin: phone, // Save cleaned phone
                dob: dobInput.value,
                gender: genderInput.value,
                email: emailInput.value.trim(),
                hometown: hometownInput.value.trim(),
                job: jobInput.value.trim(),
                cccd: cccdInput.value.trim(),
                plate: plateInput.value.trim()
            };

            console.log("Adding new resident:", newRes);

            // Update State
            if (!Array.isArray(room.residents)) {
                room.residents = [];
            }
            room.residents.push(newRes);

            // Save & Refresh
            await saveData();
            updateStats();
            renderBuilding();
            renderResidentList(room.residents);

            // Clear & Close
            form.reset();
            closeModal();

            // Re-enable button
            btn.disabled = false;
            btn.innerHTML = originalBtnText;

            // Notify
            setTimeout(() => {
                alert(`✅ Đã thêm cư dân "${name}" vào phòng ${room.number || room.id} thành công!`);
            }, 300);

        } catch (err) {
            console.error("Lỗi trong quá trình thêm cư dân:", err);
            alert("Lỗi: " + err.message);
            btn.disabled = false;
        }
    };

    // Also support button click explicitly if needed (though type="submit" handles it)
    btn.onclick = () => {
        if (form.reportValidity()) {
            // Form onsubmit will trigger
        }
    };
}

// Call setup
setupAddResidentHandler();

// === Edit Resident Modal Logic ===
let editingResidentIndex = null;
const editResidentModal = document.getElementById('edit-resident-modal');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const editResidentForm = document.getElementById('edit-resident-form');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

window.openEditModal = (index) => {
    if (!currentRoomId) return;
    const room = buildingState.find(r => r.id === currentRoomId);
    if (!room || !room.residents[index]) return;

    editingResidentIndex = index;
    const resident = room.residents[index];

    // Điền thông tin hiện tại vào form
    document.getElementById('edit-name').value = resident.name || '';
    document.getElementById('edit-dob').value = resident.dob || '';
    document.getElementById('edit-gender').value = resident.gender || 'Nam';
    document.getElementById('edit-phone-login').value = resident.phoneLogin || '';
    document.getElementById('edit-email').value = resident.email || '';
    document.getElementById('edit-hometown').value = resident.hometown || '';
    document.getElementById('edit-job').value = resident.job || '';
    document.getElementById('edit-cccd').value = resident.cccd || '';
    document.getElementById('edit-plate').value = resident.plate || '';

    editResidentModal.classList.remove('hidden');
};

function closeEditModal() {
    editResidentModal.classList.add('hidden');
    editingResidentIndex = null;
    editResidentForm.reset();
}

closeEditModalBtn.onclick = closeEditModal;
btnCancelEdit.onclick = closeEditModal;

editResidentForm.onsubmit = async (e) => {
    e.preventDefault();
    if (editingResidentIndex === null || !currentRoomId) return;

    const room = buildingState.find(r => r.id === currentRoomId);
    if (!room) return;

    const oldResident = room.residents[editingResidentIndex];
    const oldPhone = oldResident.phoneLogin;

    const newName = document.getElementById('edit-name').value;
    const newDob = document.getElementById('edit-dob').value;
    const newGender = document.getElementById('edit-gender').value;
    const newPhone = document.getElementById('edit-phone-login').value.trim();
    const newEmail = document.getElementById('edit-email').value.trim();
    const newHometown = document.getElementById('edit-hometown').value;
    const newJob = document.getElementById('edit-job').value;
    const newCccd = document.getElementById('edit-cccd').value;
    const newPlate = document.getElementById('edit-plate').value;

    // 1. Đồng bộ với tài khoản đăng nhập (User Collection) trên Server
    if (oldPhone) {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API_URL}/users/${oldPhone}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newName,
                    phone: newPhone,
                    email: newEmail
                })
            });
            const syncResult = await res.json();
            if (!syncResult.success && syncResult.message.includes('SĐT mới đã được sử dụng')) {
                alert(`⚠️ Lỗi: ${syncResult.message}`);
                return;
            }
            console.log("User sync result:", syncResult);
        } catch (err) {
            console.error("Lỗi đồng bộ tài khoản:", err);
        }
    }

    // 2. Cập nhật thông tin cư dân trong ApartmentData
    room.residents[editingResidentIndex] = {
        ...oldResident,
        name: newName,
        dob: newDob,
        gender: newGender,
        phoneLogin: newPhone,
        email: newEmail,
        hometown: newHometown,
        job: newJob,
        cccd: newCccd,
        plate: newPlate
    };

    // 3. Refresh UI & Save
    renderResidentList(room.residents);
    updateStats();
    renderBuilding();
    await saveData();

    alert("✅ Đã cập nhật thông tin cư dân và đồng bộ tài khoản thành công!");
    closeEditModal();
};

window.addEventListener('click', (e) => {
    if (e.target === editResidentModal) {
        closeEditModal();
    }
});

// Remove Resident - Using Custom Modal
let pendingDeleteIndex = null;
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');

window.removeResident = (index) => {
    if (!currentRoomId) return;
    pendingDeleteIndex = index;
    deleteConfirmModal.classList.remove('hidden');
};

btnCancelDelete.onclick = (e) => {
    e.stopPropagation();
    pendingDeleteIndex = null;
    deleteConfirmModal.classList.add('hidden');
};

btnConfirmDelete.onclick = async (e) => {
    e.stopPropagation();
    if (pendingDeleteIndex === null || !currentRoomId) return;

    const room = buildingState.find(r => r.id === currentRoomId);
    if (room && room.residents[pendingDeleteIndex]) {
        const residentToDelete = room.residents[pendingDeleteIndex];
        const phoneToDelete = residentToDelete.phoneLogin;
        const residentName = residentToDelete.name;

        // 1. Xóa khỏi danh sách phòng (Local)
        room.residents.splice(pendingDeleteIndex, 1);

        // 2. Gọi lệnh xóa tài khoản trên Server
        if (phoneToDelete) {
            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/users/${phoneToDelete}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();

                if (result.success) {
                    alert(`✅ Đã xóa cư dân "${residentName}" và tài khoản đăng nhập (${phoneToDelete}) vĩnh viễn.`);
                } else {
                    console.warn("Lưu ý:", result.message);
                    alert(`⚠️ Đã xóa cư dân khỏi phòng, nhưng không tìm thấy tài khoản để xóa (SĐT: ${phoneToDelete}).`);
                }
            } catch (err) {
                console.error("Lỗi xóa tài khoản:", err);
                alert("❌ Lỗi kết nối khi xóa tài khoản. Vui lòng kiểm tra lại mạng.");
            }
        } else {
            alert(`⚠️ Đã xóa cư dân "${residentName}", nhưng người này chưa có SĐT đăng nhập nên không thể xóa tài khoản.`);
        }

        // 3. Refresh UI Local First (Fast Response)
        renderResidentList(room.residents);
        updateStats();
        renderBuilding();

        // Cập nhật lại tiêu đề và trạng thái modal nếu cần
        const statusEl = document.getElementById('modal-status');
        if (room.residents.length === 0) {
            statusEl.textContent = 'Còn trống';
            statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
            statusEl.style.color = '#10b981';
        }

        // 4. Save Apartment Data to Server in background
        await saveData();
    }

    pendingDeleteIndex = null;
    deleteConfirmModal.classList.add('hidden');
};

// Close delete modal when clicking outside
deleteConfirmModal.onclick = (e) => {
    if (e.target === deleteConfirmModal) {
        pendingDeleteIndex = null;
        deleteConfirmModal.classList.add('hidden');
    }
};

// === All Residents Modal Logic ===
const allResidentsModal = document.getElementById('all-residents-modal');
const closeAllResidentsBtn = document.getElementById('close-all-residents-modal');
const allResidentsListEl = document.getElementById('all-residents-list');
const allResidentsCountEl = document.getElementById('all-residents-count');
const statTotalResidentsCard = document.getElementById('stat-total-residents');

// --- Pending Users Assignment Logic ---
let pendingUsersState = [];
window.pendingAssignUser = null;

async function checkPendingUsers() {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/users/unassigned`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        const card = document.getElementById('stat-pending-users');
        const countEl = document.getElementById('pending-users-count');

        if (result.success && result.data.length > 0) {
            pendingUsersState = result.data;
            countEl.textContent = result.data.length;
            card.style.display = 'flex';
        } else {
            pendingUsersState = [];
            card.style.display = 'none';
        }
    } catch (err) {
        console.error("Error checking pending users:", err);
    }
}

window.openPendingUsersModal = () => {
    const listEl = document.getElementById('pending-users-list');
    listEl.innerHTML = '';

    if (pendingUsersState.length === 0) {
        listEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">Không có ai đang chờ.</td></tr>';
    } else {
        pendingUsersState.forEach(user => {
            const tr = document.createElement('tr');
            const dateStr = new Date(user.createdAt).toLocaleDateString('vi-VN');
            tr.innerHTML = `
                <td><strong>${user.name}</strong></td>
                <td>${user.phone}</td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn-check" onclick="startAssignPending('${user.phone}', '${user.name}')">
                        <i class="fa-solid fa-link"></i> Gán Phòng
                    </button>
                </td>
            `;
            listEl.appendChild(tr);
        });
    }
    document.getElementById('pending-users-modal').classList.remove('hidden');
};

const closePendingModalBtn = document.getElementById('close-pending-users-modal');
if (closePendingModalBtn) closePendingModalBtn.onclick = () => document.getElementById('pending-users-modal').classList.add('hidden');

// Step 1: Click "Assign" in the pending list
window.startAssignPending = (phone, name) => {
    window.pendingAssignUser = { phone, name };
    document.getElementById('pending-users-modal').classList.add('hidden');

    // Highlight the diagram to prompt room selection
    const diagram = document.getElementById('building-diagram');
    diagram.scrollIntoView({ behavior: 'smooth', block: 'center' });
    diagram.style.outline = '4px solid #a855f7';
    diagram.style.boxShadow = '0 0 30px rgba(168, 85, 247, 0.4)';

    // Create a temporary floating instruction
    const toast = document.createElement('div');
    toast.style = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#a855f7; color:white; padding:1rem 2rem; border-radius:50px; z-index:10000; box-shadow:0 10px 20px rgba(0,0,0,0.3); font-weight:bold;";
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> Vui lòng chọn một phòng trong sơ đồ để gán cho <b>${name}</b>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        diagram.style.transition = 'all 0.5s';
        diagram.style.outline = 'none';
        diagram.style.boxShadow = 'none';
        setTimeout(() => document.body.removeChild(toast), 4000);
    }, 5000);
};

// This matches room click logic. When a room is clicked, we check if pendingAssignUser is set.
// (Modified rendering logic will handle the fill during room selection)

window.openAllResidentsModal = () => {
    const listEl = document.getElementById('all-residents-list');
    const countEl = document.getElementById('all-residents-count');
    listEl.innerHTML = '';

    let all = [];
    buildingState.forEach(room => {
        if (room.residents) {
            room.residents.forEach(res => {
                all.push({ ...res, roomName: room.id });
            });
        }
    });

    countEl.textContent = all.length;

    if (all.length === 0) {
        listEl.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem;">Chưa có cư dân nào.</td></tr>';
    } else {
        all.forEach((res, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><strong>${res.name}</strong></td>
                <td><span class="room-badge">P.${res.roomName}</span></td>
                <td>${res.gender}</td>
                <td>${res.job || '-'}</td>
            `;
            tr.style.cursor = 'pointer';
            tr.onclick = () => window.openAndEditFromAll(res.roomName);
            listEl.appendChild(tr);
        });
    }
    document.getElementById('all-residents-modal').classList.remove('hidden');
};

const closeAllResModalBtn = document.getElementById('close-all-residents-modal');
if (closeAllResModalBtn) closeAllResModalBtn.onclick = () => document.getElementById('all-residents-modal').classList.add('hidden');

// Event Listeners for All Residents Modal
if (statTotalResidentsCard) {
    statTotalResidentsCard.style.cursor = 'pointer';
    statTotalResidentsCard.onclick = () => window.openAllResidentsModal();
}

if (closeAllResidentsBtn) {
    closeAllResidentsBtn.onclick = () => {
        document.getElementById('all-residents-modal').classList.add('hidden');
    };
}

window.addEventListener('click', (e) => {
    if (e.target === allResidentsModal) {
        allResidentsModal.classList.add('hidden');
    }
});

// === Parking Modal Logic (Motorcycle List) ===
const parkingModal = document.getElementById('parking-modal');
const closeParkingModalBtn = document.getElementById('close-parking-modal');
const parkingListEl = document.getElementById('parking-list');
const parkingBikeCountEl = document.getElementById('parking-bike-count');

window.openParkingModal = () => {
    const parkingListEl = document.getElementById('parking-list');
    const bikeCountEl = document.getElementById('parking-bike-count');
    parkingListEl.innerHTML = '';

    let plates = [];
    buildingState.forEach(item => {
        if (item.residents) {
            item.residents.forEach(res => {
                if (res.plate && res.plate.trim() !== '') {
                    plates.push({
                        plate: res.plate,
                        owner: res.name,
                        room: item.id
                    });
                }
            });
        }
    });

    bikeCountEl.textContent = plates.length;

    if (plates.length === 0) {
        parkingListEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">Chưa có xe máy nào được đăng ký.</td></tr>';
    } else {
        plates.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td><strong class="plate-highlight">${item.plate}</strong></td>
                <td><span class="room-badge">P.${item.room}</span></td>
                <td>${item.owner}</td>
            `;
            tr.style.cursor = 'pointer';
            tr.onclick = () => window.openAndEditFromAll(item.room);
            parkingListEl.appendChild(tr);
        });
    }

    parkingModal.classList.remove('hidden');
};

function closeParkingModal() {
    parkingModal.classList.add('hidden');
}

// Event Listeners for Parking Modal
if (closeParkingModalBtn) {
    closeParkingModalBtn.onclick = closeParkingModal;
}

const statTotalBikesCard = document.getElementById('stat-total-bikes');
if (statTotalBikesCard) {
    statTotalBikesCard.style.cursor = 'pointer';
    statTotalBikesCard.onclick = () => window.openParkingModal();
}

window.addEventListener('click', (e) => {
    if (e.target === parkingModal) {
        closeParkingModal();
    }
});

// Navigation logic removed for classic view

// ==================== INVOICE MANAGEMENT ====================
const invoiceModal = document.getElementById('invoice-modal');
const closeInvoiceModalBtn = document.getElementById('close-invoice-modal');
const openInvoiceModalBtn = document.getElementById('btn-open-invoice-modal');
const invoiceForm = document.getElementById('invoice-form');
const invRoomSelect = document.getElementById('inv-room-id');
const invoiceFilterSelect = document.getElementById('invoice-filter-month'); // Select element

// Global prices
const PRICE_ELEC = 2500;
const FEE_INTERNET = 100000;
const FEE_WATER = 100000;
const FEE_SERVICE = 200000;

async function loadInvoices() {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/invoices`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            invoices = result.data;
            populateInvoiceFilter(); // Update filter options
            renderInvoices();        // Render list based on current selection
        }
    } catch (e) {
        console.error("Lỗi lấy hóa đơn:", e);
    }
}

function populateInvoiceFilter() {
    if (!invoiceFilterSelect) return;

    const currentVal = invoiceFilterSelect.value;
    const currentYear = new Date().getFullYear();

    // Reset options
    invoiceFilterSelect.innerHTML = '<option value="all">Tất cả thời gian</option>';

    // Use a Set to store unique Month/Year combinations
    const timeSet = new Set();

    // 1. Always add all 12 months of the current year
    for (let m = 1; m <= 12; m++) {
        timeSet.add(`${m}/${currentYear}`);
    }

    // 2. Add existing months from invoices (to include past years if data exists)
    invoices.forEach(inv => {
        timeSet.add(`${inv.month}/${inv.year}`);
    });

    // Sort: Year desc, then Month desc (Newest first)
    const sortedTimes = Array.from(timeSet).sort((a, b) => {
        const [m1, y1] = a.split('/').map(Number);
        const [m2, y2] = b.split('/').map(Number);
        if (y1 !== y2) return y2 - y1;
        return m2 - m1;
    });

    sortedTimes.forEach(timeStr => {
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = `Tháng ${timeStr}`;
        invoiceFilterSelect.appendChild(opt);
    });

    // Restore previous selection if valid
    if (timeSet.has(currentVal)) {
        invoiceFilterSelect.value = currentVal;
    }
}

// Event Listener for Filter Change
if (invoiceFilterSelect) {
    invoiceFilterSelect.onchange = renderInvoices;
}

function renderInvoices() {
    const body = document.getElementById('invoice-list-body');
    if (!body) return;

    body.innerHTML = '';

    // Filter Logic
    let displayInvoices = invoices;
    if (invoiceFilterSelect && invoiceFilterSelect.value !== 'all') {
        const [m, y] = invoiceFilterSelect.value.split('/');
        displayInvoices = invoices.filter(inv => inv.month == m && inv.year == y);
    }

    if (displayInvoices.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-secondary);">Không có hóa đơn nào phù hợp.</td></tr>';
        return;
    }

    displayInvoices.forEach(inv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Tháng ${inv.month}/${inv.year}</td>
            <td><span class="room-badge">P.${inv.roomName}</span></td>
            <td><strong>${inv.totalAmount.toLocaleString()} đ</strong></td>
            <td>
                <span class="status-badge ${inv.status}">${inv.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>
            </td>
            <td>${new Date(inv.createdAt).toLocaleDateString('vi-VN')}</td>
            <td>
                <div class="action-btns" style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn-icon success" onclick="toggleInvoiceStatus('${inv._id}', '${inv.status}')" title="Đổi trạng thái">
                        <i class="fa-solid fa-money-bill-transfer"></i>
                    </button>
                    <button class="btn-icon" onclick="printInvoice('${inv._id}')" title="In Hóa Đơn" style="color: #3b82f6; border-color: #3b82f6;">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteInvoice('${inv._id}')" title="Xóa">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                    ${inv.paymentRequest ? `
                        <div class="payment-notif-badge" style="background: var(--accent-red); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 5px; animation: pulse 2s infinite; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);">
                            <i class="fa-solid fa-circle-exclamation"></i> Cư dân báo đã trả
                        </div>
                    ` : ''}
                </div>
            </td>
        `;
        body.appendChild(tr);
    });
}

window.exportRevenueReport = () => {
    // Determine data based on current filter
    let dataToExport = invoices;
    const filterVal = invoiceFilterSelect ? invoiceFilterSelect.value : 'all';

    if (filterVal !== 'all') {
        const [m, y] = filterVal.split('/');
        dataToExport = invoices.filter(inv => inv.month == m && inv.year == y);
    }

    if (dataToExport.length === 0) {
        return alert(`Không có dữ liệu hóa đơn cho ${filterVal === 'all' ? 'tất cả thời gian' : 'Tháng ' + filterVal} để xuất báo cáo.`);
    }

    // Prepare data for Excel
    const data = dataToExport.map(inv => ({
        "Mã Hóa Đơn": inv._id.slice(-6).toUpperCase(),
        "Tháng": `T${inv.month}/${inv.year}`,
        "Phòng": inv.roomName,
        "Người Đại Diện": inv.representativeName,
        "Số Người": inv.residentCount,
        "Điện Cũ": inv.electricity.oldValue,
        "Điện Mới": inv.electricity.newValue,
        "Tiền Điện": (inv.electricity.newValue - inv.electricity.oldValue) * inv.electricity.price,
        "Tiền Nước": inv.waterFee,
        "Internet": inv.internetFee,
        "Dịch Vụ": inv.serviceFee,
        "Giá Phòng": inv.roomPrice,
        "Tổng Cộng": inv.totalAmount,
        "Trạng Thái": inv.status === 'paid' ? 'Đã Thanh Toán' : 'Chưa Thanh Toán',
        "Ngày Tạo": new Date(inv.createdAt).toLocaleDateString('vi-VN')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    const sheetName = filterVal === 'all' ? "Doanh Thu Tong Hop" : `Doanh Thu T${filterVal.replace('/', '_')}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName = filterVal === 'all' ? "BaoCao_TongHop.xlsx" : `BaoCao_T${filterVal.replace('/', '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

window.printInvoice = (id) => {
    const inv = invoices.find(i => i._id === id);
    if (!inv) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Font setup (using standard font, might not support special VN chars well without custom font, but standard ASCII maps work)
    // For simplicity in this demo, we use default font. For full VN support, we'd need to add a font base64.
    // We will use "Times"

    doc.setFontSize(22);
    doc.text("HOA DON TIEN PHONG", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Phong: ${inv.roomName}`, 20, 40);
    doc.text(`Thang: ${inv.month}/${inv.year}`, 150, 40);

    doc.text("---------------------------------------------------------------------------------", 20, 48);

    let y = 60;
    doc.text(`Dai dien: ${inv.representativeName || 'Khach thue'}`, 20, y);
    doc.text(`So nguoi: ${inv.residentCount}`, 150, y); y += 10;

    // Details
    doc.text("Chi tiet:", 20, y); y += 10;

    const elecUsage = inv.electricity.newValue - inv.electricity.oldValue;
    const elecMoney = elecUsage * inv.electricity.price;

    doc.text(`1. Tien phong:`, 20, y);
    doc.text(`${inv.roomPrice.toLocaleString()} VND`, 150, y, { align: "left" }); y += 10;

    doc.text(`2. Dien (${elecUsage} kWh x ${inv.electricity.price}):`, 20, y);
    doc.text(`${elecMoney.toLocaleString()} VND`, 150, y, { align: "left" }); y += 10;

    doc.text(`3. Nuoc:`, 20, y);
    doc.text(`${inv.waterFee.toLocaleString()} VND`, 150, y, { align: "left" }); y += 10;

    doc.text(`4. Internet:`, 20, y);
    doc.text(`${inv.internetFee.toLocaleString()} VND`, 150, y, { align: "left" }); y += 10;

    doc.text(`5. Dich vu chung:`, 20, y);
    doc.text(`${inv.serviceFee.toLocaleString()} VND`, 150, y, { align: "left" }); y += 15;

    doc.text("---------------------------------------------------------------------------------", 20, y); y += 10;

    doc.setFontSize(16);
    doc.text(`TONG CONG: ${inv.totalAmount.toLocaleString()} VND`, 20, y); y += 10;

    doc.setFontSize(12);
    doc.text(`Trang thai: ${inv.status === 'paid' ? 'DA THANH TOAN' : 'CHUA THANH TOAN'}`, 20, y); y += 20;

    doc.setFontSize(10);
    doc.text("Cam on quy khach da su dung dich vu!", 105, y, { align: "center" });

    // Save
    doc.save(`HoaDon_P${inv.roomName}_T${inv.month}.pdf`);
};

window.toggleInvoiceStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';

    // Tìm button để tạo hiệu ứng loading local
    // Note: event is deprecated/not reliable in async context without passing it, 
    // but for simple onclick in attribute it works in browsers. 
    // Better practice: pass 'this' in HTML but we keep simple here.

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/invoices/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (res.ok) {
            // Cập nhật dữ liệu cục bộ trước để UI phản hồi ngay lập tức
            const inv = invoices.find(i => i._id === id);
            if (inv) {
                inv.status = newStatus;
                if (newStatus === 'paid') inv.paymentRequest = false;
            }
            renderInvoices();
        } else {
            alert("Không thể cập nhật trạng thái hóa đơn.");
        }
    } catch (e) {
        console.error(e);
    }
};

window.deleteInvoice = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa hóa đơn này?")) return;
    try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_URL}/invoices/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadInvoices();
    } catch (e) {
        alert("Lỗi khi xóa hóa đơn");
    }
};

// Handle Invoice Modal
openInvoiceModalBtn.onclick = () => {
    // Populate room select
    if (!invRoomSelect) return;

    invRoomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';
    buildingState.filter(item => item.type === 'room').forEach(room => {
        const opt = document.createElement('option');
        opt.value = room.id;
        opt.textContent = `Phòng ${room.id} (${room.residents.length} ng)`;
        invRoomSelect.appendChild(opt);
    });

    // Auto-calculate parking fee when room is selected
    invRoomSelect.onchange = () => {
        const roomId = invRoomSelect.value;
        const room = buildingState.find(r => r.id === roomId);
        if (room) {
            calculateInvoiceTotal();
        }
    };

    // Set current month/year
    const now = new Date();
    document.getElementById('inv-month').value = now.getMonth() + 1;
    document.getElementById('inv-year').value = now.getFullYear();

    // Reset form fields
    document.getElementById('inv-elec-old').value = 0;
    document.getElementById('inv-elec-new').value = 0;

    calculateInvoiceTotal();
    invoiceModal.classList.remove('hidden');
};

function calculateInvoiceTotal() {
    const resCount = parseFloat(document.getElementById('inv-resident-count').value) || 0;
    const roomPrice = parseFloat(document.getElementById('inv-room-price').value) || 0;
    const eOld = parseFloat(document.getElementById('inv-elec-old').value) || 0;
    const eNew = parseFloat(document.getElementById('inv-elec-new').value) || 0;

    const internetTotal = resCount * FEE_INTERNET;
    const waterTotal = resCount * FEE_WATER;
    const serviceTotal = resCount * FEE_SERVICE;
    const electricityUsed = Math.max(0, eNew - eOld);
    const electricityTotal = electricityUsed * PRICE_ELEC;

    // Update display fields
    if (document.getElementById('inv-elec-used'))
        document.getElementById('inv-elec-used').value = electricityUsed + ' kWh';
    if (document.getElementById('inv-internet-display'))
        document.getElementById('inv-internet-display').value = internetTotal.toLocaleString() + ' đ';
    if (document.getElementById('inv-water-display'))
        document.getElementById('inv-water-display').value = waterTotal.toLocaleString() + ' đ';
    if (document.getElementById('inv-service-display'))
        document.getElementById('inv-service-display').value = serviceTotal.toLocaleString() + ' đ';

    const total = roomPrice + internetTotal + waterTotal + serviceTotal + electricityTotal;

    document.getElementById('inv-total-display').textContent = total.toLocaleString() + ' đ';
    return total;
}

// Auto calculate on input
['inv-resident-count', 'inv-room-price', 'inv-elec-old', 'inv-elec-new'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = calculateInvoiceTotal;
});

// Auto fill when room selected
invRoomSelect.onchange = () => {
    const roomId = invRoomSelect.value;
    const room = buildingState.find(r => r.id === roomId);
    if (room && room.residents) {
        document.getElementById('inv-representative').value = room.residents.length > 0 ? room.residents[0].name : '';
        document.getElementById('inv-resident-count').value = room.residents.length;
        calculateInvoiceTotal();
    }
};

invoiceForm.onsubmit = async (e) => {
    e.preventDefault();
    const roomId = invRoomSelect.value;
    if (!roomId) return alert("Vui lòng chọn phòng");

    const total = calculateInvoiceTotal();
    const resCount = parseInt(document.getElementById('inv-resident-count').value) || 0;

    const invoiceData = {
        roomId: roomId,
        roomName: roomId,
        representativeName: document.getElementById('inv-representative').value,
        residentCount: resCount,
        month: parseInt(document.getElementById('inv-month').value),
        year: parseInt(document.getElementById('inv-year').value),
        roomPrice: parseFloat(document.getElementById('inv-room-price').value) || 0,
        electricity: {
            oldValue: parseFloat(document.getElementById('inv-elec-old').value) || 0,
            newValue: parseFloat(document.getElementById('inv-elec-new').value) || 0,
            price: PRICE_ELEC
        },
        waterFee: resCount * FEE_WATER,
        internetFee: resCount * FEE_INTERNET,
        serviceFee: resCount * FEE_SERVICE,
        totalAmount: total
    };

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/invoices`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(invoiceData)
        });
        const data = await res.json();
        if (data.success) {
            invoiceModal.classList.add('hidden');
            // Cập nhật danh sách hóa đơn ngay lập tức
            await loadInvoices();
            // Hiển thị thông báo nhẹ nhàng thay vì alert gây nháy
            console.log("Hóa đơn đã được lưu");
        }
    } catch (e) {
        alert("Lỗi lưu hóa đơn");
    }
};

closeInvoiceModalBtn.onclick = () => invoiceModal.classList.add('hidden');

// === Reset System Logic (Custom Modal) ===
const resetModal = document.getElementById('reset-modal');
const resetInput = document.getElementById('reset-confirm-input');
const resetExecuteBtn = document.getElementById('btn-execute-reset');
const resetCloseBtn = document.getElementById('btn-close-reset-modal');
const btnResetSystem = document.getElementById('btn-reset-system');

if (btnResetSystem) {
    btnResetSystem.onclick = () => {
        resetModal.classList.remove('hidden');
        resetInput.value = '';
        resetExecuteBtn.disabled = true;
        resetExecuteBtn.style.opacity = '0.5';
    };
}

if (resetCloseBtn) {
    resetCloseBtn.onclick = () => resetModal.classList.add('hidden');
}

if (resetInput) {
    resetInput.oninput = (e) => {
        const value = e.target.value.trim().toUpperCase();
        if (value === 'RESET') {
            resetExecuteBtn.disabled = false;
            resetExecuteBtn.style.opacity = '1';
        } else {
            resetExecuteBtn.disabled = true;
            resetExecuteBtn.style.opacity = '0.5';
        }
    };
}

if (resetExecuteBtn) {
    resetExecuteBtn.onclick = async () => {
        if (resetInput.value.trim().toUpperCase() !== 'RESET') return;

        resetExecuteBtn.disabled = true;
        resetExecuteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang Reset...';

        // Create Full-screen Loading Overlay
        const overlay = document.createElement('div');
        overlay.className = 'reset-loading-overlay';
        overlay.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation fa-beat"></i>
            <p>Đang dọn dẹp hệ thống, vui lòng không tắt trình duyệt...</p>
        `;
        document.body.appendChild(overlay);

        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`${API_URL}/system/reset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (data.success) {
                // Clear any legacy local storage
                localStorage.removeItem('buildingResidentData');
                localStorage.removeItem('apartmentData');

                // Keep the overlay for a second to feel the "cleanliness"
                overlay.innerHTML = `
                    <i class="fa-solid fa-circle-check" style="color: #10b981;"></i>
                    <p>${data.message}</p>
                `;

                setTimeout(() => {
                    location.reload();
                }, 2000);
            } else {
                document.body.removeChild(overlay);
                alert("❌ Lỗi: " + data.message);
                resetExecuteBtn.disabled = false;
                resetExecuteBtn.innerHTML = 'Xác Nhận Xoá Hết';
            }
        } catch (err) {
            document.body.removeChild(overlay);
            console.error("Reset error:", err);
            alert("❌ Lỗi kết nối khi gửi lệnh Reset.");
            resetExecuteBtn.disabled = false;
            resetExecuteBtn.innerHTML = 'Xác Nhận Xoá Hết';
        }
    };
}

// Close reset modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === resetModal) {
        resetModal.classList.add('hidden');
    }
});

// Helper to jump from All Residents list to specific room
window.openAndEditFromAll = (roomId) => {
    document.getElementById('all-residents-modal').classList.add('hidden');
    document.getElementById('parking-modal').classList.add('hidden');
    openModal(roomId);
};

// === Maintenance & Feedback Logic ===
let maintenanceRequests = [];
const maintenanceModal = document.getElementById('maintenance-modal');
const maintenanceForm = document.getElementById('maintenance-form');
const maintenanceListBody = document.getElementById('maintenance-list-body');
const btnOpenMaintenanceModal = document.getElementById('btn-open-maintenance-modal');
const closeMaintenanceModalBtn = document.getElementById('close-maintenance-modal');
const maintDetailModal = document.getElementById('maint-detail-modal');
const maintDetailBody = document.getElementById('maint-detail-body');
const closeMaintDetailBtn = document.getElementById('close-maint-detail');

async function loadMaintenanceRequests() {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/maintenance`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            maintenanceRequests = data.data;
            renderMaintenanceList();
        }
    } catch (e) {
        console.error("Lỗi tải phản hồi:", e);
    }
}

function renderMaintenanceList() {
    if (!maintenanceListBody) return;
    maintenanceListBody.innerHTML = '';

    if (maintenanceRequests.length === 0) {
        maintenanceListBody.innerHTML = '<tr><td colspan="7" class="empty-message">Chưa có yêu cầu hoặc phản hồi nào</td></tr>';
        return;
    }

    maintenanceRequests.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = 'maint-row-clickable';
        tr.onclick = () => viewMaintDetail(req._id);

        const typeIcon = req.type === 'maintenance' ? 'fa-wrench' : 'fa-comment-alt';
        const typeLabel = req.type === 'maintenance' ? 'Bảo trì' : 'Góp ý';

        const date = new Date(req.createdAt).toLocaleDateString('vi-VN');

        let statusText = '';
        switch (req.status) {
            case 'pending': statusText = 'Chờ xử lý'; break;
            case 'in-progress': statusText = 'Đang sửa'; break;
            case 'completed': statusText = 'Hoàn thành'; break;
            case 'cancelled': statusText = 'Đã hủy'; break;
        }

        // Action buttons (Admin only for status changes)
        let actions = '';
        if (isAdmin) {
            actions = `
                <div class="action-btns">
                    ${req.status === 'pending' ? `<button class="btn-icon success" onclick="event.stopPropagation(); updateMaintStatus('${req._id}', 'in-progress')" title="Bắt đầu sửa"><i class="fa-solid fa-play"></i></button>` : ''}
                    ${['pending', 'in-progress'].includes(req.status) ? `<button class="btn-icon success" onclick="event.stopPropagation(); updateMaintStatus('${req._id}', 'completed')" title="Xong"><i class="fa-solid fa-check-double"></i></button>` : ''}
                    <button class="btn-icon danger" onclick="event.stopPropagation(); deleteMaintRequest('${req._id}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        } else if (req.status === 'pending') {
            actions = `<button class="btn-icon danger" onclick="event.stopPropagation(); updateMaintStatus('${req._id}', 'cancelled')" title="Hủy yêu cầu"><i class="fa-solid fa-ban"></i></button>`;
        }

        tr.innerHTML = `
            <td>${date}</td>
            <td><strong>${req.roomName}</strong></td>
            <td>
                <div class="text-truncate" style="font-weight: 500; max-width: 200px;">${req.title}</div>
                <small class="text-truncate" style="color: var(--text-secondary); max-width: 250px;">${req.description}</small>
            </td>
            <td><i class="fa-solid ${typeIcon} maint-type-icon"></i> ${typeLabel}</td>
            <td><span class="priority-badge priority-${req.priority}">${req.priority === 'high' ? 'Khẩn cấp' : (req.priority === 'medium' ? 'Thường' : 'Thấp')}</span></td>
            <td><span class="status-badge ${req.status}">${statusText}</span></td>
            <td>${actions}</td>
        `;
        maintenanceListBody.appendChild(tr);
    });
}

function viewMaintDetail(id) {
    const req = maintenanceRequests.find(r => r._id === id);
    if (!req) return;

    let statusText = '';
    switch (req.status) {
        case 'pending': statusText = 'Chờ xử lý'; break;
        case 'in-progress': statusText = 'Đang sửa'; break;
        case 'completed': statusText = 'Hoàn thành'; break;
        case 'cancelled': statusText = 'Đã hủy'; break;
    }

    const typeLabel = req.type === 'maintenance' ? 'Bảo trì / Sửa chữa' : 'Ý kiến đóng góp';
    const date = new Date(req.createdAt).toLocaleString('vi-VN');

    maintDetailBody.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Phòng</span>
            <div class="detail-value"><strong>${req.roomName}</strong></div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Loại yêu cầu</span>
            <div class="detail-value">${typeLabel}</div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Thời gian gửi</span>
            <div class="detail-value">${date}</div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Mức độ ưu tiên</span>
            <div class="detail-value">
                <span class="priority-badge priority-${req.priority}">
                    ${req.priority === 'high' ? 'KHẨN CẤP' : (req.priority === 'medium' ? 'THƯỜNG' : 'THẤP')}
                </span>
            </div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Trạng thái</span>
            <div class="detail-value"><span class="status-badge ${req.status}">${statusText}</span></div>
        </div>
        <div class="detail-row">
            <span class="detail-label">Tiêu đề</span>
            <div class="detail-value"><strong>${req.title}</strong></div>
        </div>
        <div class="detail-row" style="border-bottom: none;">
            <span class="detail-label">Nội dung chi tiết</span>
            <div class="detail-value" style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; white-space: pre-wrap;">${req.description}</div>
        </div>
    `;

    maintDetailModal.classList.remove('hidden');
}

if (closeMaintDetailBtn) {
    closeMaintDetailBtn.onclick = () => maintDetailModal.classList.add('hidden');
}

window.addEventListener('click', (e) => {
    if (e.target === maintDetailModal) {
        maintDetailModal.classList.add('hidden');
    }
});

if (btnOpenMaintenanceModal) {
    btnOpenMaintenanceModal.onclick = () => {
        maintenanceModal.classList.remove('hidden');
        populateMaintRoomSelect();
    };
}

function populateMaintRoomSelect() {
    const select = document.getElementById('maint-room-id');
    if (!select) return;
    const rooms = buildingState.filter(item => item.type === 'room');
    select.innerHTML = '<option value="">-- Chọn phòng --</option>';
    rooms.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room.id;
        opt.dataset.name = `Phòng ${room.id}`;
        opt.textContent = `Phòng ${room.id}`;
        select.appendChild(opt);
    });
}

if (closeMaintenanceModalBtn) {
    closeMaintenanceModalBtn.onclick = () => maintenanceModal.classList.add('hidden');
}

maintenanceForm.onsubmit = async (e) => {
    e.preventDefault();
    const roomSelect = document.getElementById('maint-room-id');
    const selectedRoom = roomSelect.options[roomSelect.selectedIndex];

    const requestData = {
        roomId: roomSelect.value,
        roomName: selectedRoom.dataset.name,
        senderName: localStorage.getItem('currentUser') ? JSON.parse(localStorage.getItem('currentUser')).name : 'Người dùng',
        type: document.getElementById('maint-type').value,
        priority: document.getElementById('maint-priority').value,
        title: document.getElementById('maint-title').value.trim(),
        description: document.getElementById('maint-description').value.trim()
    };

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/maintenance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });
        const data = await res.json();
        if (data.success) {
            maintenanceModal.classList.add('hidden');
            maintenanceForm.reset();
            await loadMaintenanceRequests();
            alert("✅ Yêu cầu của bạn đã được gửi thành công!");
        }
    } catch (e) {
        alert("Lỗi gửi yêu cầu");
    }
};

window.updateMaintStatus = async (id, newStatus) => {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/maintenance/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            await loadMaintenanceRequests();
        }
    } catch (e) {
        alert("Lỗi cập nhật trạng thái");
    }
};

window.deleteMaintRequest = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa yêu cầu này?")) return;
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/maintenance/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            await loadMaintenanceRequests();
        }
    } catch (e) {
        alert("Lỗi xóa yêu cầu");
    }
};

// ==================== ANNOUNCEMENT LOGIC ====================

async function loadAnnouncements() {
    const list = document.getElementById('admin-announcement-list');
    if (!list) return;

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/announcements`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success && result.data.length > 0) {
            list.innerHTML = '';
            result.data.forEach(ann => {
                const date = new Date(ann.createdAt).toLocaleDateString('vi-VN');

                let icon = 'fa-bullhorn';
                let colorStyle = '#3b82f6'; // default blue
                if (ann.type === 'urgent') { icon = 'fa-triangle-exclamation'; colorStyle = '#ef4444'; }
                if (ann.type === 'event') { icon = 'fa-calendar-check'; colorStyle = '#10b981'; }

                const card = document.createElement('div');
                card.className = 'announcement-card announcement-card-clickable';
                card.style.background = 'rgba(255,255,255,0.05)';
                card.style.borderRadius = '0.5rem';
                card.style.padding = '1rem';
                card.style.marginBottom = '0.75rem';
                card.style.borderLeft = `4px solid ${colorStyle}`;
                card.style.position = 'relative';
                card.onclick = () => viewAnnouncementDetail(ann);

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                <i class="fa-solid ${icon}" style="color: ${colorStyle}; font-size: 0.9rem;"></i>
                                <h4 class="text-truncate" style="margin: 0; color: white; font-size: 1rem; flex: 1;">${ann.title}</h4>
                            </div>
                            <div class="text-truncate" style="color: #94a3b8; font-size: 0.85rem;">${ann.content}</div>
                            <span style="font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; display: block;">
                                <i class="fa-solid fa-user-edit" style="font-size: 0.65rem;"></i> ${ann.createdBy || 'BQL'} • ${date}
                            </span>
                        </div>
                        <button onclick="event.stopPropagation(); deleteAnnouncement('${ann._id}')" class="btn-delete-ann" style="background: none; border: none; color: #ef4444; opacity: 0.6; cursor: pointer; padding: 0.25rem; margin-left: 0.5rem;">
                            <i class="fa-solid fa-trash" style="font-size: 0.85rem;"></i>
                        </button>
                    </div>
                `;
                list.appendChild(card);
            });
        } else {
            list.innerHTML = '<div style="text-align: center; color: #aaa; padding: 1rem;">Chưa có thông báo nào.</div>';
        }
    } catch (err) {
        console.error("Lỗi tải thông báo:", err);
    }
}

function viewAnnouncementDetail(ann) {
    const modal = document.getElementById('ann-detail-modal');
    const body = document.getElementById('ann-detail-body');
    if (!modal || !body) return;

    const date = new Date(ann.createdAt).toLocaleString('vi-VN');
    let colorStyle = '#3b82f6';
    let typeName = 'Thông báo chung';
    if (ann.type === 'urgent') { colorStyle = '#ef4444'; typeName = 'Khẩn cấp'; }
    if (ann.type === 'event') { colorStyle = '#10b981'; typeName = 'Sự kiện'; }

    let mediaHtml = '';
    if (ann.mediaType === 'image' && ann.mediaUrl) {
        mediaHtml = `<img src="${ann.mediaUrl}" style="max-width: 100%; border-radius: 0.75rem; margin-top: 1.5rem; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" alt="Media">`;
    } else if (ann.mediaType === 'video' && ann.mediaUrl) {
        mediaHtml = `<video src="${ann.mediaUrl}" controls style="max-width: 100%; border-radius: 0.75rem; margin-top: 1.5rem; display: block;"></video>`;
    }

    body.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; align-items: center;">
                <span style="background: ${colorStyle}20; color: ${colorStyle}; padding: 0.25rem 0.75rem; border-radius: 2rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                    ${typeName}
                </span>
                <span style="color: var(--text-secondary); font-size: 0.85rem;"><i class="fa-regular fa-clock"></i> ${date}</span>
                <span style="color: var(--text-secondary); font-size: 0.85rem;">• <i class="fa-solid fa-user-pen"></i> Người đăng: <strong>${ann.createdBy || 'Ban Quản Lý'}</strong></span>
            </div>
            <h3 style="color: white; font-size: 1.4rem; line-height: 1.3; margin-bottom: 1rem;">${ann.title}</h3>
            <div style="color: #cbd5e1; line-height: 1.6; font-size: 1.05rem; white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 1.25rem; border-radius: 0.75rem;">${ann.content}</div>
            ${mediaHtml}
        </div>
    `;

    modal.classList.remove('hidden');
}

const closeAnnDetailBtn = document.getElementById('close-ann-detail');
if (closeAnnDetailBtn) {
    closeAnnDetailBtn.onclick = () => document.getElementById('ann-detail-modal').classList.add('hidden');
}
window.addEventListener('click', (e) => {
    const modal = document.getElementById('ann-detail-modal');
    if (e.target === modal) modal.classList.add('hidden');
});

window.openAnnouncementModal = () => {
    document.getElementById('announcement-modal').classList.remove('hidden');
};

const closeAnnModalBtn = document.getElementById('close-announcement-modal');
if (closeAnnModalBtn) {
    closeAnnModalBtn.onclick = () => {
        document.getElementById('announcement-modal').classList.add('hidden');
        document.getElementById('announcement-form').reset();
        document.getElementById('media-preview').innerHTML = '';
        document.getElementById('media-preview').style.display = 'none';
        currentAnnMedia = { type: 'none', url: '' }; // Reset
    };
}

// Media Preview Logic
let currentAnnMedia = { type: 'none', url: '' };
const annFileInput = document.getElementById('ann-file');
if (annFileInput) {
    annFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Size check (e.g. limit 10MB client side)
        if (file.size > 10 * 1024 * 1024) {
            alert("File quá lớn! Vui lòng chọn file dưới 10MB.");
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target.result;
            const previewContainer = document.getElementById('media-preview');
            previewContainer.style.display = 'block';

            if (file.type.startsWith('image/')) {
                currentAnnMedia = { type: 'image', url: result };
                previewContainer.innerHTML = `<img src="${result}" style="max-height: 150px; border-radius: 4px; max-width: 100%;">`;
            } else if (file.type.startsWith('video/')) {
                currentAnnMedia = { type: 'video', url: result };
                previewContainer.innerHTML = `<video src="${result}" controls style="max-height: 150px; border-radius: 4px; max-width: 100%;"></video>`;
            }
        };
        reader.readAsDataURL(file);
    };
}

const annForm = document.getElementById('announcement-form');
if (annForm) {
    annForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...';
        btn.disabled = true;

        const title = document.getElementById('ann-title').value;
        const type = document.getElementById('ann-type').value;
        const content = document.getElementById('ann-content').value;

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API_URL}/announcements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    type,
                    content,
                    mediaType: currentAnnMedia.type,
                    mediaUrl: currentAnnMedia.url
                })
            });
            const result = await res.json();

            if (result.success) {
                alert("✅ Đã đăng thông báo thành công!");
                document.getElementById('announcement-modal').classList.add('hidden');
                annForm.reset();
                document.getElementById('media-preview').innerHTML = '';
                document.getElementById('media-preview').style.display = 'none';
                currentAnnMedia = { type: 'none', url: '' };
                loadAnnouncements();
            } else {
                alert("Lỗi: " + result.message);
            }
        } catch (error) {
            alert("Lỗi kết nối server (Có thể file quá lớn?)");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
}

window.deleteAnnouncement = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa thông báo này?")) return;
    try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_URL}/announcements/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadAnnouncements();
    } catch (err) {
        alert("Lỗi khi xóa");
    }
};

// ==================== MARKETPLACE LOGIC ====================

let currentMarketMedia = ''; // Base64 storage

async function loadMarketItems() {
    // Determine context: Admin or User
    const userList = document.getElementById('user-market-list');
    const adminList = document.getElementById('admin-market-list');

    // If neither exists, we might be on a page that doesn't use this, but usually script.js is shared.
    if (!userList && !adminList) return;

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/market`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success) {
            const items = result.data;
            const currentUserId = parseJwt(token).id;
            const role = parseJwt(token).role;

            const renderCard = (item) => {
                const isOwner = item.createdBy === currentUserId;
                const isAdmin = role === 'admin';
                const canDelete = isOwner || isAdmin;

                const deleteBtn = canDelete ? `
                    <button onclick="event.stopPropagation(); deleteMarketItem('${item._id}')" style="position: absolute; top: 10px; right: 10px; background: rgba(239, 68, 68, 0.9); color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                ` : '';

                return `
                    <div class="glass-panel market-card market-card-small market-card-clickable" 
                         style="position: relative;" 
                         onclick="viewMarketDetail(\`${item._id}\`)">
                        ${deleteBtn}
                        <img src="${item.image}" alt="Item">
                        <h4 class="text-truncate" style="margin: 0.5rem 0 0.2rem 0; color: white; font-size: 1rem;">${item.title}</h4>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                            <span class="price-tag" style="font-size: 0.8rem;">${item.price.toLocaleString()} đ</span>
                        </div>
                        <div class="text-truncate" style="font-size: 0.8rem; color: #94a3b8;">
                            <i class="fa-solid fa-phone" style="font-size: 0.7rem;"></i> ${item.contactPhone}
                        </div>
                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.3rem;">
                            <i class="fa-solid fa-house-user" style="font-size: 0.7rem;"></i> ${item.roomName || 'N/A'}
                        </div>
                    </div>
                `;
            };

            // Inject detailed data into window for easy access
            window.allMarketItems = items;

            if (userList) {
                userList.innerHTML = items.length ? items.map(renderCard).join('') : '<div style="text-align: center; color: #aaa; width: 100%; padding: 2rem;">Chưa có tin nào.</div>';
            }
            if (adminList) {
                adminList.innerHTML = items.length ? items.map(renderCard).join('') : '<div style="text-align: center; color: #aaa; width: 100%; padding: 2rem;">Chưa có tin nào.</div>';
            }
        }
    } catch (err) {
        console.error("Lỗi tải chợ:", err);
    }
}

function viewMarketDetail(id) {
    const item = (window.allMarketItems || []).find(i => i._id === id);
    if (!item) return;

    const modal = document.getElementById('mkt-detail-modal');
    const body = document.getElementById('mkt-detail-body');
    if (!modal || !body) return;

    body.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <img src="${item.image}" style="width: 100%; max-height: 350px; object-fit: cover; border-radius: 0.75rem; margin-bottom: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.4);" alt="Product">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem;">
                <h3 style="color: white; font-size: 1.5rem; margin: 0; line-height: 1.2;">${item.title}</h3>
                <span class="price-tag" style="font-size: 1.2rem; padding: 0.4rem 1rem;">${item.price.toLocaleString()} đ</span>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem;">
                <div>
                    <span style="display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Liên hệ</span>
                    <strong style="color: #10b981; font-size: 1.1rem;"><i class="fa-solid fa-phone"></i> ${item.contactPhone}</strong>
                </div>
                <div>
                    <span style="display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Phòng</span>
                    <strong style="color: #3b82f6; font-size: 1.1rem;"><i class="fa-solid fa-house-circle-check"></i> ${item.roomName || 'N/A'}</strong>
                </div>
                <div>
                    <span style="display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Ngày đăng</span>
                    <strong style="color: white;">${new Date(item.createdAt).toLocaleDateString('vi-VN')}</strong>
                </div>
            </div>

            <div style="color: #cbd5e1; line-height: 1.6; font-size: 1rem;">
                <span style="display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem;">Mô tả sản phẩm</span>
                <div style="white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem;">${item.description || 'Không có mô tả chi tiết cho sản phẩm này.'}</div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

// Close Market Detail Modal
const closeMktDetailBtn = document.getElementById('close-mkt-detail');
if (closeMktDetailBtn) {
    closeMktDetailBtn.onclick = () => document.getElementById('mkt-detail-modal').classList.add('hidden');
}
window.addEventListener('click', (e) => {
    const modal = document.getElementById('mkt-detail-modal');
    if (e.target === modal) modal.classList.add('hidden');
});

// Post Item Logic
window.openMarketModal = () => {
    document.getElementById('market-modal').classList.remove('hidden');
};

const closeMarketModalBtn = document.getElementById('close-market-modal');
if (closeMarketModalBtn) {
    closeMarketModalBtn.onclick = () => {
        document.getElementById('market-modal').classList.add('hidden');
        document.getElementById('market-form').reset();
        document.getElementById('mkt-preview').innerHTML = '';
        document.getElementById('mkt-preview').style.display = 'none';
        currentMarketMedia = '';
    };
}

const mktFileInput = document.getElementById('mkt-file');
if (mktFileInput) {
    mktFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("Ảnh quá lớn (Max 5MB)");
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentMarketMedia = ev.target.result;
            const preview = document.getElementById('mkt-preview');
            preview.style.display = 'block';
            preview.innerHTML = `<img src="${currentMarketMedia}" style="max-height: 150px; border-radius: 4px;">`;
        };
        reader.readAsDataURL(file);
    };
}

const marketForm = document.getElementById('market-form');
if (marketForm) {
    marketForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...';
        btn.disabled = true;

        if (!currentMarketMedia) {
            alert("Vui lòng chọn ảnh món đồ");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const data = {
            title: document.getElementById('mkt-title').value,
            price: parseFloat(document.getElementById('mkt-price').value),
            contactPhone: document.getElementById('mkt-phone').value,
            description: document.getElementById('mkt-desc').value,
            image: currentMarketMedia,
            roomName: 'BQL'
        };

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${API_URL}/market`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                alert("✅ Đã đăng tin thành công!");
                document.getElementById('market-modal').classList.add('hidden');
                marketForm.reset();
                document.getElementById('mkt-preview').style.display = 'none';
                currentMarketMedia = '';
                loadMarketItems();
            } else {
                alert("Lỗi: " + result.message);
            }
        } catch (err) {
            alert("Lỗi kết nối");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
}

window.deleteMarketItem = async (id) => {
    if (!confirm("Bạn có chắc muốn xóa tin này?")) return;
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/market/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            loadMarketItems();
        } else {
            alert(result.message || "Không thể xóa");
        }
    } catch (err) {
        alert("Lỗi kết nối");
    }
};

window.addEventListener('click', (e) => {
    const mktModal = document.getElementById('market-modal');
    if (mktModal && e.target === mktModal) {
        mktModal.classList.add('hidden');
    }
});

// Helper for JWT parsing (if not already existing)
function parseJwt(token) {
    if (!token) return {};
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

// Initial Call
loadMarketItems();


// Initialize App
initData();
renderBuilding();
updateStats();
loadInvoices();
loadMaintenanceRequests();
loadAnnouncements();
