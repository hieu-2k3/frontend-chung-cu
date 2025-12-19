// ==================== CONTRACT MANAGEMENT ====================

let allContracts = [];
let contractTerms = [];

// Load all contracts
async function loadContracts() {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/contracts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success) {
            allContracts = result.data || [];
            renderContracts();
            updateContractStats();
        }
    } catch (error) {
        console.error('Error loading contracts:', error);
    }
}

// Render contracts table
function renderContracts() {
    const listEl = document.getElementById('contracts-list');
    const filter = document.getElementById('contract-filter')?.value || 'all';

    if (!listEl) return;

    let filtered = allContracts;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Apply filter
    if (filter === 'active') {
        filtered = allContracts.filter(c => c.status === 'active');
    } else if (filter === 'expiring') {
        filtered = allContracts.filter(c => {
            const endDate = new Date(c.endDate);
            return c.status === 'active' && endDate <= in30Days && endDate >= now;
        });
    } else if (filter === 'expired') {
        filtered = allContracts.filter(c => c.status === 'expired' || new Date(c.endDate) < now);
    }

    listEl.innerHTML = '';

    if (filtered.length === 0) {
        listEl.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color: var(--text-secondary);">Không có hợp đồng nào.</td></tr>';
        return;
    }

    filtered.forEach(contract => {
        const tr = document.createElement('tr');
        const endDate = new Date(contract.endDate);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        let statusBadge = '';
        if (contract.status === 'active') {
            if (daysLeft < 0) {
                statusBadge = '<span class="status-badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;">Đã hết hạn</span>';
            } else if (daysLeft <= 30) {
                statusBadge = `<span class="status-badge" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24;">Còn ${daysLeft} ngày</span>`;
            } else {
                statusBadge = '<span class="status-badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">Đang hoạt động</span>';
            }
        } else if (contract.status === 'terminated') {
            statusBadge = '<span class="status-badge" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8;">Đã kết thúc</span>';
        }

        tr.innerHTML = `
            <td><span class="room-badge">P.${contract.roomName}</span></td>
            <td><strong>${contract.tenantName}</strong></td>
            <td>${contract.tenantPhone}</td>
            <td>${new Date(contract.startDate).toLocaleDateString('vi-VN')}</td>
            <td>${endDate.toLocaleDateString('vi-VN')}</td>
            <td>${contract.deposit.toLocaleString()}đ</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-icon" onclick="viewContractDetail('${contract._id}')" title="Xem chi tiết">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn-icon" onclick="editContract('${contract._id}')" title="Sửa">
                        <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-icon danger" onclick="terminateContract('${contract._id}')" title="Kết thúc">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                </div>
            </td>
        `;

        listEl.appendChild(tr);
    });
}

// Update contract statistics
function updateContractStats() {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const activeCount = allContracts.filter(c => c.status === 'active').length;
    const expiringCount = allContracts.filter(c => {
        const endDate = new Date(c.endDate);
        return c.status === 'active' && endDate <= in30Days && endDate >= now;
    }).length;

    const totalEl = document.getElementById('total-contracts');
    const activeEl = document.getElementById('active-contracts-count');
    const expiringEl = document.getElementById('expiring-contracts-count');

    if (totalEl) totalEl.textContent = activeCount;
    if (activeEl) activeEl.textContent = activeCount;
    if (expiringEl) expiringEl.textContent = expiringCount;
}

// Open contracts modal
window.openContractsModal = async function () {
    await loadContracts();
    document.getElementById('contracts-modal').classList.remove('hidden');
};

// Open create contract modal
window.openCreateContractModal = function () {
    document.getElementById('contract-form-title').textContent = 'Tạo Hợp Đồng Mới';
    document.getElementById('contract-id').value = '';
    document.getElementById('contract-form').reset();
    contractTerms = [];
    renderContractTerms();

    // Populate room dropdown - only show occupied rooms
    const roomSelect = document.getElementById('contract-room');
    roomSelect.innerHTML = '<option value="">-- Chọn phòng --</option>';
    buildingState.filter(item => item.type === 'room').forEach(room => {
        // Only add rooms that have residents
        if (room.residents && room.residents.length > 0) {
            const opt = document.createElement('option');
            opt.value = room.id;
            opt.textContent = `Phòng ${room.id} (${room.residents.length} người)`;
            roomSelect.appendChild(opt);
        }
    });

    document.getElementById('create-contract-modal').classList.remove('hidden');
};

// Close create contract modal
window.closeCreateContractModal = function () {
    document.getElementById('create-contract-modal').classList.add('hidden');
};

// Calculate end date automatically
document.addEventListener('DOMContentLoaded', () => {
    const startDateEl = document.getElementById('contract-start-date');
    const durationEl = document.getElementById('contract-duration');
    const endDateEl = document.getElementById('contract-end-date');

    if (startDateEl && durationEl && endDateEl) {
        const calculateEndDate = () => {
            const startDate = startDateEl.value;
            const duration = parseInt(durationEl.value);

            if (startDate && duration > 0) {
                const start = new Date(startDate);
                const end = new Date(start);
                end.setMonth(end.getMonth() + duration);
                endDateEl.value = end.toISOString().split('T')[0];
            }
        };

        startDateEl.addEventListener('change', calculateEndDate);
        durationEl.addEventListener('input', calculateEndDate);
    }
});

// Add contract term
window.addContractTerm = function () {
    const input = document.getElementById('new-term-input');
    const term = input.value.trim();

    if (term) {
        contractTerms.push(term);
        input.value = '';
        renderContractTerms();
    }
};

// Render contract terms
function renderContractTerms() {
    const listEl = document.getElementById('contract-terms-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    contractTerms.forEach((term, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem; margin-bottom: 0.5rem;';
        div.innerHTML = `
            <i class="fa-solid fa-check" style="color: var(--accent-green);"></i>
            <span style="flex: 1;">${term}</span>
            <button type="button" class="btn-icon danger" onclick="removeContractTerm(${index})" style="padding: 0.25rem 0.5rem;">
                <i class="fa-solid fa-times"></i>
            </button>
        `;
        listEl.appendChild(div);
    });
}

// Remove contract term
window.removeContractTerm = function (index) {
    contractTerms.splice(index, 1);
    renderContractTerms();
};

// Submit contract form
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contract-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();

            const contractId = document.getElementById('contract-id').value;
            const contractData = {
                roomId: document.getElementById('contract-room').value,
                roomName: document.getElementById('contract-room').value,
                tenantName: document.getElementById('contract-tenant-name').value,
                tenantPhone: document.getElementById('contract-tenant-phone').value,
                tenantIdCard: document.getElementById('contract-tenant-id').value,
                monthlyRent: parseFloat(document.getElementById('contract-monthly-rent').value),
                deposit: parseFloat(document.getElementById('contract-deposit').value),
                depositPaid: document.getElementById('contract-deposit-paid').checked,
                startDate: document.getElementById('contract-start-date').value,
                endDate: document.getElementById('contract-end-date').value,
                duration: parseInt(document.getElementById('contract-duration').value),
                terms: contractTerms
            };

            try {
                const token = localStorage.getItem('authToken');
                const url = contractId ? `${API_URL}/contracts/${contractId}` : `${API_URL}/contracts`;
                const method = contractId ? 'PATCH' : 'POST';

                const res = await fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(contractData)
                });

                const result = await res.json();

                if (result.success) {
                    closeCreateContractModal();
                    await loadContracts();
                    alert(contractId ? 'Đã cập nhật hợp đồng' : 'Đã tạo hợp đồng thành công');
                } else {
                    alert(result.message || 'Có lỗi xảy ra');
                }
            } catch (error) {
                console.error('Error saving contract:', error);
                alert('Có lỗi xảy ra khi lưu hợp đồng');
            }
        };
    }
});

// View contract detail
window.viewContractDetail = async function (contractId) {
    const contract = allContracts.find(c => c._id === contractId);
    if (!contract) return;

    const content = document.getElementById('contract-detail-content');
    const now = new Date();
    const endDate = new Date(contract.endDate);
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    content.innerHTML = `
        <div style="padding: 1rem;">
            <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">
                <i class="fa-solid fa-user"></i> Thông tin khách thuê
            </h3>
            <p><strong>Họ tên:</strong> ${contract.tenantName}</p>
            <p><strong>SĐT:</strong> ${contract.tenantPhone}</p>
            ${contract.tenantIdCard ? `<p><strong>CMND/CCCD:</strong> ${contract.tenantIdCard}</p>` : ''}
            
            <h3 style="color: var(--accent-green); margin: 1.5rem 0 1rem;">
                <i class="fa-solid fa-money-bill-wave"></i> Thông tin tài chính
            </h3>
            <p><strong>Tiền thuê:</strong> ${contract.monthlyRent.toLocaleString()}đ/tháng</p>
            <p><strong>Tiền cọc:</strong> ${contract.deposit.toLocaleString()}đ</p>
            <p><strong>Trạng thái cọc:</strong> ${contract.depositPaid ? '✅ Đã nhận' : '❌ Chưa nhận'}</p>
            
            <h3 style="color: var(--accent-amber); margin: 1.5rem 0 1rem;">
                <i class="fa-solid fa-calendar-days"></i> Thời hạn
            </h3>
            <p><strong>Bắt đầu:</strong> ${new Date(contract.startDate).toLocaleDateString('vi-VN')}</p>
            <p><strong>Kết thúc:</strong> ${endDate.toLocaleDateString('vi-VN')}</p>
            <p><strong>Thời hạn:</strong> ${contract.duration} tháng</p>
            <p><strong>Còn lại:</strong> ${daysLeft > 0 ? daysLeft + ' ngày' : 'Đã hết hạn'}</p>
            
            ${contract.terms && contract.terms.length > 0 ? `
                <h3 style="color: var(--text-secondary); margin: 1.5rem 0 1rem;">
                    <i class="fa-solid fa-list-check"></i> Điều khoản
                </h3>
                <ul style="padding-left: 1.5rem;">
                    ${contract.terms.map(term => `<li>${term}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `;

    document.getElementById('contract-detail-modal').classList.remove('hidden');
};

// Edit contract
window.editContract = function (contractId) {
    const contract = allContracts.find(c => c._id === contractId);
    if (!contract) return;

    document.getElementById('contract-form-title').textContent = 'Sửa Hợp Đồng';
    document.getElementById('contract-id').value = contract._id;
    document.getElementById('contract-room').value = contract.roomId;
    document.getElementById('contract-tenant-name').value = contract.tenantName;
    document.getElementById('contract-tenant-phone').value = contract.tenantPhone;
    document.getElementById('contract-tenant-id').value = contract.tenantIdCard || '';
    document.getElementById('contract-monthly-rent').value = contract.monthlyRent;
    document.getElementById('contract-deposit').value = contract.deposit;
    document.getElementById('contract-deposit-paid').checked = contract.depositPaid;
    document.getElementById('contract-start-date').value = contract.startDate.split('T')[0];
    document.getElementById('contract-duration').value = contract.duration;
    document.getElementById('contract-end-date').value = contract.endDate.split('T')[0];

    contractTerms = contract.terms || [];
    renderContractTerms();

    openCreateContractModal();
};

// Terminate contract
window.terminateContract = async function (contractId) {
    if (!confirm('Bạn có chắc chắn muốn kết thúc hợp đồng này?')) return;

    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/contracts/${contractId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await res.json();

        if (result.success) {
            await loadContracts();
            alert('Đã kết thúc hợp đồng');
        } else {
            alert(result.message || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error terminating contract:', error);
        alert('Có lỗi xảy ra');
    }
};

// Close modals
document.addEventListener('DOMContentLoaded', () => {
    const closeButtons = [
        { id: 'close-contracts-modal', modal: 'contracts-modal' },
        { id: 'close-create-contract-modal', modal: 'create-contract-modal' },
        { id: 'close-contract-detail-modal', modal: 'contract-detail-modal' }
    ];

    closeButtons.forEach(({ id, modal }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => document.getElementById(modal).classList.add('hidden');
        }
    });

    // Filter change
    const filterEl = document.getElementById('contract-filter');
    if (filterEl) {
        filterEl.onchange = renderContracts;
    }
});
