/* ==========================================================================
   BR REDDY SALES APPROVAL PORTAL - CORE APPLICATION LOGIC
   Backed by Firebase Authentication + Firestore (shared cloud database)
   ========================================================================== */

// Global State
let currentUser = null;           // { uid, email, name, role }
let selectedSubmissionId = null;  // For the modal view
let submissionsCache = [];        // Local mirror of the live Firestore data
let unsubscribeSubmissions = null; // Firestore listener cleanup handle

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        showConfigError();
        return;
    }
    setupEventListeners();

    // Firebase keeps the session alive across page reloads automatically.
    auth.onAuthStateChanged(async (fbUser) => {
        if (fbUser) {
            try {
                const userDoc = await db.collection('users').doc(fbUser.uid).get();
                if (!userDoc.exists) {
                    // Auth account exists but no profile doc (shouldn't normally happen)
                    alert('Account profile not found. Please contact the owner.');
                    await auth.signOut();
                    return;
                }
                const data = userDoc.data();
                currentUser = { uid: fbUser.uid, email: fbUser.email, name: data.name, role: data.role };
                enterApp();
            } catch (err) {
                console.error(err);
                showFirestoreError(err);
            }
        } else {
            currentUser = null;
            detachSubmissionsListener();
            showAuthView();
        }
    });
});

function showConfigError() {
    document.body.innerHTML = `
        <div style="max-width:600px;margin:80px auto;padding:24px;font-family:sans-serif;color:#fff;background:#18181b;border-radius:12px;border:1px solid #E31837;">
            <h2 style="color:#E31837;">Firebase not configured</h2>
            <p>Open <code>firebase-config.js</code> and paste in your Firebase project keys.
            See <code>FIREBASE_SETUP.md</code> for step-by-step instructions.</p>
        </div>`;
}

function showFirestoreError(err) {
    alert('Could not load your account data. Check your internet connection or Firestore setup.\n\n' + err.message);
}

/* ==========================================================================
   VIEW SWITCHING
   ========================================================================== */

function showAuthView() {
    document.getElementById('header-user-info').classList.add('hidden');
    document.getElementById('section-auth').classList.remove('hidden');
    document.getElementById('section-manager').classList.add('hidden');
    document.getElementById('section-owner').classList.add('hidden');

    document.getElementById('card-login').classList.remove('hidden');
    document.getElementById('card-signup').classList.add('hidden');
}

function enterApp() {
    const headerInfo = document.getElementById('header-user-info');
    const authSection = document.getElementById('section-auth');
    const managerSection = document.getElementById('section-manager');
    const ownerSection = document.getElementById('section-owner');

    headerInfo.classList.remove('hidden');
    document.getElementById('nav-user-email').textContent = currentUser.email;
    document.getElementById('nav-user-role').textContent = currentUser.role;
    authSection.classList.add('hidden');

    if (currentUser.role === 'owner') {
        managerSection.classList.add('hidden');
        ownerSection.classList.remove('hidden');
        initOwnerDashboard();
    } else {
        ownerSection.classList.add('hidden');
        managerSection.classList.remove('hidden');
        initManagerDashboard();
    }
}

/* ==========================================================================
   EVENT LISTENERS
   ========================================================================== */

function setupEventListeners() {
    document.getElementById('link-goto-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('card-login').classList.add('hidden');
        document.getElementById('card-signup').classList.remove('hidden');
    });

    document.getElementById('link-goto-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('card-signup').classList.add('hidden');
        document.getElementById('card-login').classList.remove('hidden');
    });

    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-signup').addEventListener('submit', handleSignup);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    const calcTriggers = document.querySelectorAll('.calc-trigger');
    calcTriggers.forEach(input => input.addEventListener('input', calculateManagerTotal));

    document.getElementById('btn-clear-sale').addEventListener('click', clearSaleForm);
    document.getElementById('form-sale').addEventListener('submit', handleSaleSubmit);

    document.getElementById('owner-filter-search').addEventListener('input', filterOwnerQueue);
    document.getElementById('owner-filter-manager').addEventListener('change', filterOwnerQueue);
    document.getElementById('owner-filter-status').addEventListener('change', filterOwnerQueue);

    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('modal-detail').addEventListener('click', (e) => {
        if (e.target.id === 'modal-detail') closeModal();
    });

    document.getElementById('btn-modal-approve').addEventListener('click', approveSelectedSale);
    document.getElementById('btn-modal-reject').addEventListener('click', showRejectionInput);
    document.getElementById('btn-cancel-rejection').addEventListener('click', hideRejectionInput);
    document.getElementById('btn-confirm-rejection').addEventListener('click', confirmRejectionSelectedSale);
}

/* ==========================================================================
   AUTHENTICATION
   ========================================================================== */

function setButtonLoading(btn, loading, loadingText) {
    if (loading) {
        btn.dataset.originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
    } else {
        btn.disabled = false;
        if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    setButtonLoading(btn, true, 'Signing in...');
    try {
        await auth.signInWithEmailAndPassword(email, password);
        document.getElementById('form-login').reset();
    } catch (err) {
        alert(friendlyAuthError(err));
    } finally {
        setButtonLoading(btn, false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const role = document.querySelector('input[name="signup-role"]:checked').value;
    const btn = e.target.querySelector('button[type="submit"]');

    setButtonLoading(btn, true, 'Creating account...');
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({
            name, email, role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('form-signup').reset();
        // onAuthStateChanged will fire automatically and load the app
    } catch (err) {
        alert(friendlyAuthError(err));
    } finally {
        setButtonLoading(btn, false);
    }
}

function handleLogout() {
    detachSubmissionsListener();
    auth.signOut();
}

function friendlyAuthError(err) {
    switch (err.code) {
        case 'auth/email-already-in-use': return 'An account with this email address already exists!';
        case 'auth/invalid-email': return 'Please enter a valid email address.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return 'Invalid email or password.';
        case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
        default: return err.message;
    }
}

/* ==========================================================================
   MANAGER DASHBOARD
   ========================================================================== */

function initManagerDashboard() {
    const dateInput = document.getElementById('sale-date');
    dateInput.value = new Date().toISOString().split('T')[0];
    clearSaleForm();
    attachManagerListener();
}

function attachManagerListener() {
    detachSubmissionsListener();
    unsubscribeSubmissions = db.collection('submissions')
        .where('managerUid', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            submissionsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderManagerSubmissionsTable();
            // Keep modal in sync if it's open
            if (selectedSubmissionId) refreshOpenModalIfNeeded();
        }, (err) => {
            console.error(err);
            showFirestoreError(err);
        });
}

function detachSubmissionsListener() {
    if (unsubscribeSubmissions) {
        unsubscribeSubmissions();
        unsubscribeSubmissions = null;
    }
    submissionsCache = [];
}

function calculateManagerTotal() {
    const newPrice = parseFloat(document.getElementById('sale-new-price').value) || 0;
    const oldPrice = parseFloat(document.getElementById('sale-old-price').value) || 0;
    const finance = parseFloat(document.getElementById('sale-finance').value) || 0;
    const implement = parseFloat(document.getElementById('sale-implement').value) || 0;
    const trInsurance = parseFloat(document.getElementById('sale-tr-insurance').value) || 0;
    const documentation = parseFloat(document.getElementById('sale-documentation').value) || 0;
    const tcs = parseFloat(document.getElementById('sale-tcs').value) || 0;
    const accessories = parseFloat(document.getElementById('sale-accessories').value) || 0;

    const subtotal = newPrice + implement + trInsurance + documentation + tcs + accessories;
    const deductions = oldPrice + finance;
    const netTotal = subtotal - deductions;

    document.getElementById('summary-subtotal').textContent = `₹ ${subtotal.toLocaleString('en-IN')}`;
    document.getElementById('summary-deductions').textContent = `- ₹ ${deductions.toLocaleString('en-IN')}`;
    document.getElementById('summary-total').textContent = `₹ ${netTotal.toLocaleString('en-IN')}`;

    document.getElementById('summary-total').classList.toggle('negative', netTotal < 0);

    return { subtotal, deductions, netTotal };
}

function clearSaleForm() {
    document.getElementById('form-sale').reset();
    document.getElementById('sale-date').value = new Date().toISOString().split('T')[0];
    calculateManagerTotal();
}

async function handleSaleSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');

    const customerId = document.getElementById('sale-customer-id').value.trim();
    const customerName = document.getElementById('sale-customer-name').value.trim();
    const relation = document.getElementById('sale-relation').value.trim();
    const date = document.getElementById('sale-date').value;
    const village = document.getElementById('sale-village').value.trim();
    const mandal = document.getElementById('sale-mandal').value.trim();

    const newPrice = parseFloat(document.getElementById('sale-new-price').value) || 0;
    const oldPrice = parseFloat(document.getElementById('sale-old-price').value) || 0;
    const finance = parseFloat(document.getElementById('sale-finance').value) || 0;
    const implement = parseFloat(document.getElementById('sale-implement').value) || 0;
    const trInsurance = parseFloat(document.getElementById('sale-tr-insurance').value) || 0;
    const documentation = parseFloat(document.getElementById('sale-documentation').value) || 0;
    const tcs = parseFloat(document.getElementById('sale-tcs').value) || 0;
    const accessories = parseFloat(document.getElementById('sale-accessories').value) || 0;

    const { netTotal } = calculateManagerTotal();

    const newSubmission = {
        managerUid: currentUser.uid,
        managerEmail: currentUser.email,
        managerName: currentUser.name,
        customerId, customerName, relation, date, village, mandal,
        newTractorPrice: newPrice,
        oldTractorPrice: oldPrice,
        finance,
        implementPrice: implement,
        trInsurance,
        documentationCharge: documentation,
        tcsCharge: tcs,
        accessories,
        totalPrice: netTotal,
        status: 'Pending',
        updatedDate: '',
        remarks: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    setButtonLoading(btn, true, 'Submitting...');
    try {
        await db.collection('submissions').add(newSubmission);
        alert('Vehicle sale details submitted successfully for approval!');
        clearSaleForm();
    } catch (err) {
        console.error(err);
        alert('Could not submit this sale. Please check your connection and try again.\n\n' + err.message);
    } finally {
        setButtonLoading(btn, false);
    }
}

function renderManagerSubmissionsTable() {
    const tbody = document.getElementById('manager-submissions-body');
    tbody.innerHTML = '';

    if (submissionsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No submissions found. Submit a sale on the left.</td></tr>`;
        return;
    }

    submissionsCache.forEach(sub => {
        const row = document.createElement('tr');
        const statusBadge = getStatusBadgeHtml(sub.status);
        const updatedDateText = sub.updatedDate ? formatDate(sub.updatedDate) : `<span class="decision-date-label">Waiting...</span>`;

        row.innerHTML = `
            <td>${formatDate(sub.date)}</td>
            <td style="font-weight: 500;">${escapeHtml(sub.customerName)}</td>
            <td>${escapeHtml(sub.village)}</td>
            <td style="font-weight: 600; color: #fff;">₹ ${sub.totalPrice.toLocaleString('en-IN')}</td>
            <td>${statusBadge}</td>
            <td>${updatedDateText}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-view-detail" data-id="${sub.id}">
                    <i class="fa-solid fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('.btn-view-detail').forEach(btn => {
        btn.addEventListener('click', (e) => openDetailModal(e.currentTarget.getAttribute('data-id')));
    });
}

/* ==========================================================================
   OWNER DASHBOARD
   ========================================================================== */

function initOwnerDashboard() {
    attachOwnerListener();
}

function attachOwnerListener() {
    detachSubmissionsListener();
    unsubscribeSubmissions = db.collection('submissions')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            submissionsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            populateManagersFilter();
            calculateOwnerStats();
            filterOwnerQueue();
            if (selectedSubmissionId) refreshOpenModalIfNeeded();
        }, (err) => {
            console.error(err);
            showFirestoreError(err);
        });
}

function calculateOwnerStats() {
    const total = submissionsCache.length;
    const pending = submissionsCache.filter(s => s.status === 'Pending').length;
    const approved = submissionsCache.filter(s => s.status === 'Approved').length;
    const rejected = submissionsCache.filter(s => s.status === 'Rejected').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-approved').textContent = approved;
    document.getElementById('stat-rejected').textContent = rejected;
}

function populateManagersFilter() {
    const select = document.getElementById('owner-filter-manager');
    const previousVal = select.value || 'all';
    select.innerHTML = '<option value="all">All Managers</option>';

    const managerEmails = new Set();
    submissionsCache.forEach(s => managerEmails.add(s.managerEmail));

    managerEmails.forEach(email => {
        const option = document.createElement('option');
        option.value = email;
        option.textContent = email;
        select.appendChild(option);
    });

    if ([...managerEmails, 'all'].includes(previousVal)) select.value = previousVal;
}

function renderOwnerQueueTable(listToRender) {
    const tbody = document.getElementById('owner-submissions-body');
    tbody.innerHTML = '';

    if (listToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No submissions found matching the criteria.</td></tr>`;
        return;
    }

    listToRender.forEach(sub => {
        const row = document.createElement('tr');
        const statusBadge = getStatusBadgeHtml(sub.status);
        const updatedDateText = sub.updatedDate ? formatDate(sub.updatedDate) : `<span class="decision-date-label">Waiting...</span>`;

        row.innerHTML = `
            <td>${formatDate(sub.date)}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(sub.managerEmail)}</td>
            <td style="font-weight: 500; color: var(--primary-color);">${escapeHtml(sub.customerId)}</td>
            <td style="font-weight: 600;">${escapeHtml(sub.customerName)}</td>
            <td>${escapeHtml(sub.village)}</td>
            <td style="font-weight: 700; color: #fff;">₹ ${sub.totalPrice.toLocaleString('en-IN')}</td>
            <td>${statusBadge}</td>
            <td>${updatedDateText}</td>
            <td>
                <button class="btn ${sub.status === 'Pending' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-review-sale" data-id="${sub.id}">
                    <i class="fa-solid ${sub.status === 'Pending' ? 'fa-signature' : 'fa-eye'}"></i> ${sub.status === 'Pending' ? 'Review' : 'View'}
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('.btn-review-sale').forEach(btn => {
        btn.addEventListener('click', (e) => openDetailModal(e.currentTarget.getAttribute('data-id')));
    });
}

function filterOwnerQueue() {
    const searchVal = document.getElementById('owner-filter-search').value.toLowerCase();
    const managerVal = document.getElementById('owner-filter-manager').value;
    const statusVal = document.getElementById('owner-filter-status').value;

    const filtered = submissionsCache.filter(sub => {
        const matchesSearch = sub.customerName.toLowerCase().includes(searchVal) ||
                              sub.customerId.toLowerCase().includes(searchVal) ||
                              sub.village.toLowerCase().includes(searchVal) ||
                              sub.mandal.toLowerCase().includes(searchVal);
        const matchesManager = managerVal === 'all' || sub.managerEmail === managerVal;
        const matchesStatus = statusVal === 'all' || sub.status === statusVal;
        return matchesSearch && matchesManager && matchesStatus;
    });

    renderOwnerQueueTable(filtered);
}

/* ==========================================================================
   DETAIL MODAL CONTROLLER
   ========================================================================== */

function openDetailModal(id) {
    selectedSubmissionId = id;
    renderModalContent();
    document.getElementById('modal-detail').classList.remove('hidden');
}

function refreshOpenModalIfNeeded() {
    const stillExists = submissionsCache.some(s => s.id === selectedSubmissionId);
    if (stillExists) {
        renderModalContent();
    } else {
        closeModal();
    }
}

function renderModalContent() {
    const sub = submissionsCache.find(s => s.id === selectedSubmissionId);
    if (!sub) return;

    document.getElementById('modal-cust-id').textContent = sub.customerId;
    document.getElementById('modal-cust-name').textContent = sub.customerName;
    document.getElementById('modal-relation').textContent = sub.relation;
    document.getElementById('modal-village').textContent = sub.village;
    document.getElementById('modal-mandal').textContent = sub.mandal;
    document.getElementById('modal-date').textContent = formatDate(sub.date);
    document.getElementById('modal-manager').textContent = `${sub.managerName} (${sub.managerEmail})`;

    document.getElementById('modal-new-price').textContent = `₹ ${sub.newTractorPrice.toLocaleString('en-IN')}`;
    document.getElementById('modal-old-price').textContent = `- ₹ ${sub.oldTractorPrice.toLocaleString('en-IN')}`;
    document.getElementById('modal-finance').textContent = `- ₹ ${sub.finance.toLocaleString('en-IN')}`;
    document.getElementById('modal-implement').textContent = `₹ ${sub.implementPrice.toLocaleString('en-IN')}`;
    document.getElementById('modal-tr-insurance').textContent = `₹ ${sub.trInsurance.toLocaleString('en-IN')}`;
    document.getElementById('modal-documentation').textContent = `₹ ${sub.documentationCharge.toLocaleString('en-IN')}`;
    document.getElementById('modal-tcs').textContent = `₹ ${sub.tcsCharge.toLocaleString('en-IN')}`;
    document.getElementById('modal-accessories').textContent = `₹ ${sub.accessories.toLocaleString('en-IN')}`;
    document.getElementById('modal-total-price').textContent = `₹ ${sub.totalPrice.toLocaleString('en-IN')}`;
    document.getElementById('modal-total-price').className = sub.totalPrice < 0 ? 'val text-right total-val negative' : 'val text-right total-val';

    const badge = document.getElementById('modal-status-badge');
    badge.className = 'badge';
    if (sub.status === 'Pending') {
        badge.classList.add('badge-pending');
        badge.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Pending`;
    } else if (sub.status === 'Approved') {
        badge.classList.add('badge-approved');
        badge.innerHTML = `<i class="fa-solid fa-check"></i> Approved`;
    } else {
        badge.classList.add('badge-rejected');
        badge.innerHTML = `<i class="fa-solid fa-ban"></i> Rejected`;
    }

    const remarksView = document.getElementById('modal-remarks-view');
    if (sub.status === 'Rejected' && sub.remarks) {
        remarksView.classList.remove('hidden');
        document.getElementById('modal-remarks-text').textContent = sub.remarks;
    } else {
        remarksView.classList.add('hidden');
    }

    const updatedTimeView = document.getElementById('modal-updated-time-view');
    if (sub.updatedDate) {
        updatedTimeView.classList.remove('hidden');
        document.getElementById('modal-updated-time').textContent = formatDateTime(sub.updatedDate);
    } else {
        updatedTimeView.classList.add('hidden');
    }

    const footer = document.getElementById('modal-footer-decisions');
    document.getElementById('modal-rejection-input').classList.add('hidden');
    document.getElementById('rejection-remarks').value = '';

    if (currentUser.role === 'owner' && sub.status === 'Pending') {
        footer.classList.remove('hidden');
    } else {
        footer.classList.add('hidden');
    }
}

function closeModal() {
    document.getElementById('modal-detail').classList.add('hidden');
    selectedSubmissionId = null;
}

async function approveSelectedSale() {
    if (!selectedSubmissionId) return;
    if (!confirm('Are you sure you want to APPROVE this tractor sale submission?')) return;

    try {
        await db.collection('submissions').doc(selectedSubmissionId).update({
            status: 'Approved',
            updatedDate: new Date().toISOString(),
            remarks: ''
        });
        closeModal();
    } catch (err) {
        console.error(err);
        alert('Could not approve this submission. Please try again.\n\n' + err.message);
    }
}

function showRejectionInput() {
    document.getElementById('modal-rejection-input').classList.remove('hidden');
    document.getElementById('modal-footer-decisions').classList.add('hidden');
    document.getElementById('rejection-remarks').focus();
}

function hideRejectionInput() {
    document.getElementById('modal-rejection-input').classList.add('hidden');
    document.getElementById('modal-footer-decisions').classList.remove('hidden');
}

async function confirmRejectionSelectedSale() {
    if (!selectedSubmissionId) return;

    const remarks = document.getElementById('rejection-remarks').value.trim();
    if (!remarks) {
        alert('Please provide a rejection reason before confirming rejection.');
        return;
    }

    try {
        await db.collection('submissions').doc(selectedSubmissionId).update({
            status: 'Rejected',
            updatedDate: new Date().toISOString(),
            remarks
        });
        closeModal();
    } catch (err) {
        console.error(err);
        alert('Could not reject this submission. Please try again.\n\n' + err.message);
    }
}

/* ==========================================================================
   HELPERS
   ========================================================================== */

function getStatusBadgeHtml(status) {
    if (status === 'Pending') return `<span class="badge badge-pending"><i class="fa-solid fa-hourglass-half"></i> Pending</span>`;
    if (status === 'Approved') return `<span class="badge badge-approved"><i class="fa-solid fa-check"></i> Approved</span>`;
    return `<span class="badge badge-rejected"><i class="fa-solid fa-ban"></i> Rejected</span>`;
}

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateString) {
    if (!dateString) return '-';
    if (dateString.includes('T')) dateString = dateString.split('T')[0];
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return `${day}/${month}/${year} ${strHours}:${minutes} ${ampm}`;
}
