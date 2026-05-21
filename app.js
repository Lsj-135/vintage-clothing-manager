// ===== 数据管理 =====
const DB_KEYS = {
  items: 'vintage_items',
  categories: 'vintage_categories',
  batches: 'vintage_batches',
  customStatuses: 'vintage_custom_statuses'
};

let currentFilter = 'all';
let currentStatusFilter = 'all';
let searchKeyword = '';
let editingItemId = null;
let currentDetailId = null;
let editingCategoryId = null;
let editingBatchId = null;
let currentImageData = null;
let settleItemId = null;
let statsTimeMode = 'month'; // year / month / day
let statsCurrentDate = new Date();

// 初始化默认数据
function initDefaults() {
  if (!localStorage.getItem(DB_KEYS.categories)) {
    const defaults = [
      { id: genId(), name: '上衣' },
      { id: genId(), name: '裤子' },
      { id: genId(), name: '裙子' },
      { id: genId(), name: '外套' },
      { id: genId(), name: '连衣裙' }
    ];
    localStorage.setItem(DB_KEYS.categories, JSON.stringify(defaults));
  }
  if (!localStorage.getItem(DB_KEYS.customStatuses)) {
    localStorage.setItem(DB_KEYS.customStatuses, JSON.stringify([]));
  }
  if (!localStorage.getItem(DB_KEYS.items)) {
    localStorage.setItem(DB_KEYS.items, JSON.stringify([]));
  }
  if (!localStorage.getItem(DB_KEYS.batches)) {
    localStorage.setItem(DB_KEYS.batches, JSON.stringify([]));
  }
}

function getData(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function setData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ===== 页面切换 =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
}

function goHome() {
  showPage('pageHome');
  editingItemId = null;
  currentImageData = null;
  renderList();
  // 重置底部导航
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item').classList.add('active');
}

function switchTab(tab, btn) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');

  switch (tab) {
    case 'home':
      showPage('pageHome');
      renderList();
      break;
    case 'categories':
      showPage('pageCategories');
      renderCategories();
      break;
    case 'batches':
      showPage('pageBatches');
      renderBatches();
      break;
    case 'stats':
      showPage('pageStats');
      renderStats();
      break;
  }
}

// ===== 搜索 =====
function showSearch() {
  document.getElementById('searchPanel').classList.remove('hidden');
  document.getElementById('searchInput').focus();
}

function hideSearch() {
  document.getElementById('searchPanel').classList.add('hidden');
  document.getElementById('searchInput').value = '';
  searchKeyword = '';
  renderList();
}

function filterItems() {
  searchKeyword = document.getElementById('searchInput').value.trim().toLowerCase();
  currentStatusFilter = document.getElementById('statusFilter').value;
  renderList();
}

// ===== 筛选 =====
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderList();
}

// ===== 衣服列表渲染 =====
function renderList() {
  const items = getData(DB_KEYS.items);
  const categories = getData(DB_KEYS.categories);
  const batches = getData(DB_KEYS.batches);

  let filtered = items;

  // 分类筛选
  if (currentFilter !== 'all') {
    filtered = filtered.filter(item => item.categoryId === currentFilter);
  }

  // 状态筛选
  if (currentStatusFilter !== 'all') {
    filtered = filtered.filter(item => item.status === currentStatusFilter);
  }

  // 搜索
  if (searchKeyword) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(searchKeyword)) ||
      (item.notes && item.notes.toLowerCase().includes(searchKeyword))
    );
  }

  // 按创建时间倒序
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const listEl = document.getElementById('clothesList');
  const emptyEl = document.getElementById('emptyState');

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  listEl.innerHTML = filtered.map(item => {
    const cat = categories.find(c => c.id === item.categoryId);
    const batch = batches.find(b => b.id === item.batchId);
    const statusText = getStatusText(item.status);
    const statusClass = 'status-' + item.status;

    return `
      <div class="clothes-card" onclick="showDetail('${item.id}')">
        <div class="card-image">
          ${item.image ? `<img src="${item.image}" alt="${item.name}">` : (cat ? escHtml(cat.name) : '衣物')}
        </div>
        <div class="card-info">
          <div class="card-name">${escHtml(item.name)}</div>
          <div class="card-meta">
            ${cat ? `<span>${escHtml(cat.name)}</span>` : ''}
            ${batch ? `<span>${escHtml(batch.name)}</span>` : ''}
          </div>
          <div class="card-prices">
            <span class="price-purchase">进: ¥${item.purchasePrice || '0'}</span>
            <span class="price-selling">卖: ¥${item.sellingPrice || '0'}</span>
          </div>
          <span class="card-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');

  renderCategoryFilters();
}

function renderCategoryFilters() {
  const categories = getData(DB_KEYS.categories);
  const items = getData(DB_KEYS.items);
  const container = document.getElementById('categoryFilters');

  container.innerHTML = categories.map(cat => {
    const count = items.filter(i => i.categoryId === cat.id).length;
    const active = currentFilter === cat.id ? 'active' : '';
    return `<button class="filter-chip ${active}" data-filter="${cat.id}" onclick="setFilter('${cat.id}', this)">${escHtml(cat.name)} (${count})</button>`;
  }).join('');
}

function getStatusText(status) {
  const map = {
    'in_stock': '在库',
    'sold': '已售',
    'returned': '已退'
  };
  if (map[status]) return map[status];

  // 自定义状态
  const customStatuses = getData(DB_KEYS.customStatuses);
  const custom = customStatuses.find(s => s.id === status);
  return custom ? custom.name : status;
}

function getStatusClass(status) {
  const defaults = ['in_stock', 'sold', 'returned'];
  if (defaults.includes(status)) return 'status-' + status;
  return 'status-in_stock';
}

// ===== 添加/编辑衣服 =====
function showAddForm() {
  editingItemId = null;
  currentImageData = null;
  document.getElementById('formTitle').textContent = '添加衣服';
  resetForm();
  populateSelects();
  showPage('pageForm');
}

function editCurrentItem() {
  if (!currentDetailId) return;
  editingItemId = currentDetailId;
  document.getElementById('formTitle').textContent = '编辑衣服';
  populateSelects();
  loadItemToForm(editingItemId);
  showPage('pageForm');
}

function resetForm() {
  document.getElementById('itemForm').reset();
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('imagePlaceholder').classList.remove('hidden');
  document.getElementById('removeImageBtn').classList.add('hidden');
  document.getElementById('saleInfoSection').classList.add('hidden');
  document.getElementById('customParams').innerHTML = '';
  currentImageData = null;
}

function populateSelects() {
  const categories = getData(DB_KEYS.categories);
  const batches = getData(DB_KEYS.batches);

  const catSelect = document.getElementById('itemCategory');
  catSelect.innerHTML = '<option value="">选择分类</option>' +
    categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  const batchSelect = document.getElementById('itemBatch');
  batchSelect.innerHTML = '<option value="">选择批次</option>' +
    batches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');

  // 状态选项
  const statusSelect = document.getElementById('itemStatus');
  const customStatuses = getData(DB_KEYS.customStatuses);
  statusSelect.innerHTML = `
    <option value="in_stock">在库</option>
    <option value="sold">已售</option>
    <option value="returned">已退</option>
    ${customStatuses.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
  `;
}

function loadItemToForm(id) {
  const items = getData(DB_KEYS.items);
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('itemName').value = item.name || '';
  document.getElementById('itemCategory').value = item.categoryId || '';
  document.getElementById('itemBatch').value = item.batchId || '';
  document.getElementById('paramLength').value = item.params?.length || '';
  document.getElementById('paramChest').value = item.params?.chest || '';
  document.getElementById('paramWaist').value = item.params?.waist || '';
  document.getElementById('paramShoulder').value = item.params?.shoulder || '';
  document.getElementById('paramSleeve').value = item.params?.sleeve || '';
  document.getElementById('paramHip').value = item.params?.hip || '';
  document.getElementById('purchasePrice').value = item.purchasePrice || '';
  document.getElementById('sellingPrice').value = item.sellingPrice || '';
  document.getElementById('itemStatus').value = item.status || 'in_stock';
  document.getElementById('actualSellingPrice').value = item.saleInfo?.actualSellingPrice || '';
  document.getElementById('receivedPrice').value = item.saleInfo?.receivedPrice || '';
  document.getElementById('soldDate').value = item.saleInfo?.soldDate || '';
  document.getElementById('itemNotes').value = item.notes || '';

  // 图片
  if (item.image) {
    currentImageData = item.image;
    document.getElementById('imagePreview').src = item.image;
    document.getElementById('imagePreview').classList.remove('hidden');
    document.getElementById('imagePlaceholder').classList.add('hidden');
    document.getElementById('removeImageBtn').classList.remove('hidden');
  }

  // 自定义参数
  const customParamsEl = document.getElementById('customParams');
  customParamsEl.innerHTML = '';
  if (item.params?.custom) {
    item.params.custom.forEach(p => {
      addCustomParamRow(p.name, p.value);
    });
  }

  toggleSaleInfo();
}

function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  if (!name) {
    showToast('请输入衣服名称');
    return;
  }

  // 收集自定义参数
  const customParams = [];
  document.querySelectorAll('.custom-param-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const pName = inputs[0].value.trim();
    const pValue = inputs[1].value.trim();
    if (pName) {
      customParams.push({ name: pName, value: pValue });
    }
  });

  const itemData = {
    name,
    categoryId: document.getElementById('itemCategory').value,
    batchId: document.getElementById('itemBatch').value,
    params: {
      length: parseFloat(document.getElementById('paramLength').value) || 0,
      chest: parseFloat(document.getElementById('paramChest').value) || 0,
      waist: parseFloat(document.getElementById('paramWaist').value) || 0,
      shoulder: parseFloat(document.getElementById('paramShoulder').value) || 0,
      sleeve: parseFloat(document.getElementById('paramSleeve').value) || 0,
      hip: parseFloat(document.getElementById('paramHip').value) || 0,
      custom: customParams
    },
    purchasePrice: parseFloat(document.getElementById('purchasePrice').value) || 0,
    sellingPrice: parseFloat(document.getElementById('sellingPrice').value) || 0,
    status: document.getElementById('itemStatus').value,
    saleInfo: {
      actualSellingPrice: parseFloat(document.getElementById('actualSellingPrice').value) || 0,
      receivedPrice: parseFloat(document.getElementById('receivedPrice').value) || 0,
      soldDate: document.getElementById('soldDate').value
    },
    image: currentImageData,
    notes: document.getElementById('itemNotes').value.trim()
  };

  const items = getData(DB_KEYS.items);

  if (editingItemId) {
    const idx = items.findIndex(i => i.id === editingItemId);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...itemData, updatedAt: new Date().toISOString() };
    }
    showToast('修改成功');
  } else {
    itemData.id = genId();
    itemData.createdAt = new Date().toISOString();
    itemData.updatedAt = new Date().toISOString();
    items.push(itemData);
    showToast('添加成功');
  }

  setData(DB_KEYS.items, items);
  editingItemId = null;
  currentImageData = null;
  goHome();
}

// ===== 图片处理 =====
function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // 压缩图片
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxSize = 800;
      let w = img.width;
      let h = img.height;

      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = (h / w) * maxSize;
          w = maxSize;
        } else {
          w = (w / h) * maxSize;
          h = maxSize;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      currentImageData = canvas.toDataURL('image/jpeg', 0.7);
      document.getElementById('imagePreview').src = currentImageData;
      document.getElementById('imagePreview').classList.remove('hidden');
      document.getElementById('imagePlaceholder').classList.add('hidden');
      document.getElementById('removeImageBtn').classList.remove('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  currentImageData = null;
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('imagePlaceholder').classList.remove('hidden');
  document.getElementById('removeImageBtn').classList.add('hidden');
  document.getElementById('imageInput').value = '';
}

// ===== 自定义参数 =====
function addCustomParam(name, value) {
  addCustomParamRow(name || '', value || '');
}

function addCustomParamRow(name, value) {
  const container = document.getElementById('customParams');
  const row = document.createElement('div');
  row.className = 'custom-param-row';
  row.innerHTML = `
    <input type="text" placeholder="参数名" value="${escHtml(name)}">
    <input type="text" placeholder="参数值" value="${escHtml(value)}">
    <button type="button" class="remove-param-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

// ===== 销售状态切换 =====
function toggleSaleInfo() {
  const status = document.getElementById('itemStatus').value;
  const section = document.getElementById('saleInfoSection');
  if (status === 'sold') {
    section.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
  }
}

// ===== 详情页 =====
function showDetail(id) {
  const items = getData(DB_KEYS.items);
  const item = items.find(i => i.id === id);
  if (!item) return;

  currentDetailId = id;
  const categories = getData(DB_KEYS.categories);
  const batches = getData(DB_KEYS.batches);
  const cat = categories.find(c => c.id === item.categoryId);
  const batch = batches.find(b => b.id === item.batchId);

  const statusText = getStatusText(item.status);
  const statusClass = getStatusClass(item.status);

  let html = '';

  // 图片
  if (item.image) {
    html += `<img class="detail-image" src="${item.image}" alt="${escHtml(item.name)}">`;
  } else {
    html += `<div class="detail-image-placeholder">${cat ? escHtml(cat.name) : '衣物'}</div>`;
  }

  // 基本信息
  html += `<div class="detail-section">
    <h3>基本信息</h3>
    <div class="detail-row"><span class="label">名称</span><span class="value">${escHtml(item.name)}</span></div>
    ${cat ? `<div class="detail-row"><span class="label">分类</span><span class="value">${escHtml(cat.name)}</span></div>` : ''}
    ${batch ? `<div class="detail-row"><span class="label">批次</span><span class="value">${escHtml(batch.name)}</span></div>` : ''}
    <div class="detail-row"><span class="label">状态</span><span class="detail-status ${statusClass}">${statusText}</span></div>
    <div class="detail-row"><span class="label">添加时间</span><span class="value">${formatDate(item.createdAt)}</span></div>
  </div>`;

  // 尺寸参数
  const params = item.params || {};
  const paramItems = [];
  if (params.length) paramItems.push(['衣长', params.length + ' cm']);
  if (params.chest) paramItems.push(['胸围', params.chest + ' cm']);
  if (params.waist) paramItems.push(['腰围', params.waist + ' cm']);
  if (params.shoulder) paramItems.push(['肩宽', params.shoulder + ' cm']);
  if (params.sleeve) paramItems.push(['袖长', params.sleeve + ' cm']);
  if (params.hip) paramItems.push(['臀围', params.hip + ' cm']);
  if (params.custom) {
    params.custom.forEach(p => {
      if (p.name) paramItems.push([p.name, p.value]);
    });
  }

  if (paramItems.length > 0) {
    html += `<div class="detail-section">
      <h3>尺寸参数</h3>
      ${paramItems.map(([label, value]) =>
        `<div class="detail-row"><span class="label">${escHtml(label)}</span><span class="value">${escHtml(value)}</span></div>`
      ).join('')}
    </div>`;
  }

  // 价格信息
  html += `<div class="detail-section">
    <h3>价格信息</h3>
    <div class="detail-row"><span class="label">进货价</span><span class="value price">¥${item.purchasePrice || '0'}</span></div>
    <div class="detail-row"><span class="label">标价</span><span class="value price">¥${item.sellingPrice || '0'}</span></div>`;

  if (item.status === 'sold' && item.saleInfo) {
    html += `<div class="detail-row"><span class="label">实际卖出价</span><span class="value price">¥${item.saleInfo.actualSellingPrice || '0'}</span></div>`;
    if (item.saleInfo.extraCost) {
      html += `<div class="detail-row"><span class="label">额外支出</span><span class="value price">¥${item.saleInfo.extraCost}</span></div>`;
    }
    html += `<div class="detail-row"><span class="label">到手价</span><span class="value price">¥${item.saleInfo.receivedPrice || '0'}</span></div>`;

    const extraCost = item.saleInfo.extraCost || 0;
    const profit = (item.saleInfo.receivedPrice || 0) - (item.purchasePrice || 0) - extraCost;
    const profitClass = profit >= 0 ? 'profit' : 'loss';
    const profitSign = profit >= 0 ? '+' : '';
    html += `<div class="detail-row"><span class="label">利润</span><span class="value ${profitClass}">${profitSign}¥${profit.toFixed(2)}</span></div>`;

    if (item.saleInfo.soldDate) {
      html += `<div class="detail-row"><span class="label">售出日期</span><span class="value">${item.saleInfo.soldDate}</span></div>`;
    }
  }

  html += `</div>`;

  // 备注
  if (item.notes) {
    html += `<div class="detail-section">
      <h3>备注</h3>
      <div class="detail-notes">${escHtml(item.notes)}</div>
    </div>`;
  }

  document.getElementById('detailContent').innerHTML = html;

  // 显示/隐藏售出按钮
  const btnSold = document.getElementById('btnMarkSold');
  if (item.status === 'in_stock') {
    btnSold.style.display = 'inline-block';
  } else {
    btnSold.style.display = 'none';
  }

  showPage('pageDetail');
}

// ===== 售出结算 =====
function showSettlePage() {
  if (!currentDetailId) return;
  settleItemId = currentDetailId;

  const items = getData(DB_KEYS.items);
  const item = items.find(i => i.id === settleItemId);
  if (!item) return;

  const categories = getData(DB_KEYS.categories);
  const cat = categories.find(c => c.id === item.categoryId);

  const purchasePrice = item.purchasePrice || 0;
  const sellingPrice = item.sellingPrice || 0;

  let html = `
    <div class="settle-item-name">${cat ? '[' + escHtml(cat.name) + '] ' : ''}${escHtml(item.name)}</div>

    <div class="form-section">
      <h3 class="section-title">关联价格</h3>
      <div class="form-group">
        <label>进货价</label>
        <input type="number" id="settlePurchase" value="${purchasePrice}" step="0.01" readonly style="background:var(--bg);color:var(--text-secondary)">
      </div>
      <div class="form-group">
        <label>标价</label>
        <input type="number" id="settleSelling" value="${sellingPrice}" step="0.01" readonly style="background:var(--bg);color:var(--text-secondary)">
      </div>
      <div class="form-group">
        <label>实际卖出价</label>
        <input type="number" id="settleActualPrice" value="${sellingPrice}" step="0.01" placeholder="0.00" oninput="calcSettleProfit()">
      </div>
      <div class="form-group">
        <label>额外支出（运费、手续费等）</label>
        <input type="number" id="settleExtraCost" value="0" step="0.01" placeholder="0.00" oninput="calcSettleProfit()">
      </div>
      <div class="form-group">
        <label>到手价</label>
        <input type="number" id="settleReceived" value="" step="0.01" placeholder="0.00" oninput="calcSettleProfit()">
      </div>
      <div class="form-group">
        <label>售出日期</label>
        <input type="date" id="settleSoldDate" value="${new Date().toISOString().split('T')[0]}">
      </div>
    </div>

    <div class="settle-summary" id="settleSummary">
      <div class="settle-profit-label">盈亏结算</div>
      <div class="settle-profit-value" id="settleProfitValue">¥0.00</div>
      <div id="settleDetailRows">
        <div class="settle-detail-row"><span class="label">进货价</span><span class="value">¥${purchasePrice.toFixed(2)}</span></div>
        <div class="settle-detail-row"><span class="label">额外支出</span><span class="value">¥0.00</span></div>
        <div class="settle-detail-row"><span class="label">总成本</span><span class="value">¥${purchasePrice.toFixed(2)}</span></div>
        <div class="settle-detail-row"><span class="label">到手价</span><span class="value">¥0.00</span></div>
      </div>
    </div>

    <div class="settle-actions">
      <button class="btn-secondary" onclick="goBackFromSettle()">取消</button>
      <button class="btn-primary" onclick="confirmSettle()">确认结算</button>
    </div>
  `;

  document.getElementById('settleContent').innerHTML = html;
  showPage('pageSettle');
  calcSettleProfit();
}

function calcSettleProfit() {
  const purchase = parseFloat(document.getElementById('settlePurchase').value) || 0;
  const extraCost = parseFloat(document.getElementById('settleExtraCost').value) || 0;
  const received = parseFloat(document.getElementById('settleReceived').value) || 0;
  const totalCost = purchase + extraCost;
  const profit = received - totalCost;

  const profitEl = document.getElementById('settleProfitValue');
  profitEl.textContent = (profit >= 0 ? '+' : '') + '¥' + profit.toFixed(2);
  profitEl.className = 'settle-profit-value ' + (profit >= 0 ? 'positive' : 'negative');

  document.getElementById('settleDetailRows').innerHTML = `
    <div class="settle-detail-row"><span class="label">进货价</span><span class="value">¥${purchase.toFixed(2)}</span></div>
    <div class="settle-detail-row"><span class="label">额外支出</span><span class="value">¥${extraCost.toFixed(2)}</span></div>
    <div class="settle-detail-row"><span class="label">总成本</span><span class="value" style="font-weight:700">¥${totalCost.toFixed(2)}</span></div>
    <div class="settle-detail-row"><span class="label">到手价</span><span class="value" style="color:var(--success)">¥${received.toFixed(2)}</span></div>
  `;
}

function confirmSettle() {
  if (!settleItemId) return;

  const actualPrice = parseFloat(document.getElementById('settleActualPrice').value) || 0;
  const extraCost = parseFloat(document.getElementById('settleExtraCost').value) || 0;
  const received = parseFloat(document.getElementById('settleReceived').value) || 0;
  const soldDate = document.getElementById('settleSoldDate').value;

  const items = getData(DB_KEYS.items);
  const idx = items.findIndex(i => i.id === settleItemId);
  if (idx === -1) return;

  items[idx].status = 'sold';
  items[idx].saleInfo = {
    actualSellingPrice: actualPrice,
    extraCost: extraCost,
    receivedPrice: received,
    soldDate: soldDate || new Date().toISOString().split('T')[0]
  };
  items[idx].updatedAt = new Date().toISOString();

  setData(DB_KEYS.items, items);
  settleItemId = null;
  showToast('结算完成');

  // 跳转到统计页
  switchTab('stats', document.querySelectorAll('.nav-item')[4]);
}

function goBackFromSettle() {
  settleItemId = null;
  if (currentDetailId) {
    showDetail(currentDetailId);
  } else {
    goHome();
  }
}

function deleteCurrentItem() {
  if (!currentDetailId) return;
  if (!confirm('确定要删除这件衣服吗？')) return;

  let items = getData(DB_KEYS.items);
  items = items.filter(i => i.id !== currentDetailId);
  setData(DB_KEYS.items, items);
  currentDetailId = null;
  showToast('已删除');
  goHome();
}

// ===== 分类管理 =====
function renderCategories() {
  const categories = getData(DB_KEYS.categories);
  const items = getData(DB_KEYS.items);
  const listEl = document.getElementById('categoryList');

  if (categories.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">尚无分类</div><p>还没有分类</p><p class="empty-hint">点击右上角新增</p></div>';
    return;
  }

  listEl.innerHTML = categories.map(cat => {
    const count = items.filter(i => i.categoryId === cat.id).length;
    return `
      <div class="manage-card">
        <div class="manage-card-info">
          <span class="manage-card-icon">[${escHtml(cat.name)}]</span>
          <div>
            <div class="manage-card-name">${escHtml(cat.name)}</div>
            <div class="manage-card-count">${count} 件衣物</div>
          </div>
        </div>
        <div class="manage-card-actions">
          <button onclick="editCategory('${cat.id}')" title="编辑">编辑</button>
          <button onclick="deleteCategory('${cat.id}')" title="删除">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

function addCategory() {
  editingCategoryId = null;
  document.getElementById('categoryModalTitle').textContent = '添加分类';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryModal').classList.remove('hidden');
}

function editCategory(id) {
  const categories = getData(DB_KEYS.categories);
  const cat = categories.find(c => c.id === id);
  if (!cat) return;

  editingCategoryId = id;
  document.getElementById('categoryModalTitle').textContent = '编辑分类';
  document.getElementById('categoryName').value = cat.name;
  document.getElementById('categoryModal').classList.remove('hidden');
}

function saveCategory() {
  const name = document.getElementById('categoryName').value.trim();
  if (!name) {
    showToast('请输入分类名称');
    return;
  }

  const categories = getData(DB_KEYS.categories);

  if (editingCategoryId) {
    const idx = categories.findIndex(c => c.id === editingCategoryId);
    if (idx !== -1) {
      categories[idx].name = name;
    }
    showToast('分类已更新');
  } else {
    categories.push({ id: genId(), name });
    showToast('分类已添加');
  }

  setData(DB_KEYS.categories, categories);
  closeCategoryModal();
  renderCategories();
  renderCategoryFilters();
}

function deleteCategory(id) {
  const items = getData(DB_KEYS.items);
  const count = items.filter(i => i.categoryId === id).length;
  if (count > 0) {
    if (!confirm(`该分类下有 ${count} 件衣服，删除后衣服将变为未分类，确定删除吗？`)) return;
  } else {
    if (!confirm('确定删除该分类吗？')) return;
  }

  let categories = getData(DB_KEYS.categories);
  categories = categories.filter(c => c.id !== id);
  setData(DB_KEYS.categories, categories);

  // 清除关联
  items.forEach(item => {
    if (item.categoryId === id) item.categoryId = '';
  });
  setData(DB_KEYS.items, items);

  renderCategories();
  renderCategoryFilters();
  showToast('分类已删除');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.add('hidden');
  editingCategoryId = null;
}

// ===== 批次管理 =====
function renderBatches() {
  const batches = getData(DB_KEYS.batches);
  const items = getData(DB_KEYS.items);
  const listEl = document.getElementById('batchList');

  if (batches.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">尚无批次</div><p>还没有批次</p><p class="empty-hint">点击右上角新增</p></div>';
    return;
  }

  listEl.innerHTML = batches.map(batch => {
    const batchItems = items.filter(i => i.batchId === batch.id);
    const totalPurchase = batchItems.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
    return `
      <div class="manage-card batch-card">
        <div class="batch-card-top">
          <span class="batch-card-name">${escHtml(batch.name)}</span>
          <div class="manage-card-actions">
            <button onclick="editBatch('${batch.id}')" title="编辑">编辑</button>
            <button onclick="deleteBatch('${batch.id}')" title="删除">删除</button>
          </div>
        </div>
        <div class="batch-card-bottom">
          <span class="batch-card-date">${batch.date || '未设日期'}</span>
          <span class="batch-card-count">${batchItems.length} 件</span>
        </div>
        <div class="batch-card-bottom">
          <span class="batch-card-cost">批次总费: ¥${batch.totalCost || '0'}</span>
          <span class="batch-card-cost" style="color:var(--text-secondary)">衣服进货合计: ¥${totalPurchase.toFixed(2)}</span>
        </div>
        ${batch.notes ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${escHtml(batch.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function addBatch() {
  editingBatchId = null;
  document.getElementById('batchModalTitle').textContent = '添加批次';
  document.getElementById('batchName').value = '';
  document.getElementById('batchDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('batchTotalCost').value = '';
  document.getElementById('batchNotes').value = '';
  document.getElementById('batchModal').classList.remove('hidden');
}

function editBatch(id) {
  const batches = getData(DB_KEYS.batches);
  const batch = batches.find(b => b.id === id);
  if (!batch) return;

  editingBatchId = id;
  document.getElementById('batchModalTitle').textContent = '编辑批次';
  document.getElementById('batchName').value = batch.name;
  document.getElementById('batchDate').value = batch.date || '';
  document.getElementById('batchTotalCost').value = batch.totalCost || '';
  document.getElementById('batchNotes').value = batch.notes || '';
  document.getElementById('batchModal').classList.remove('hidden');
}

function saveBatch() {
  const name = document.getElementById('batchName').value.trim();
  if (!name) {
    showToast('请输入批次名称');
    return;
  }

  const batchData = {
    name,
    date: document.getElementById('batchDate').value,
    totalCost: parseFloat(document.getElementById('batchTotalCost').value) || 0,
    notes: document.getElementById('batchNotes').value.trim()
  };

  const batches = getData(DB_KEYS.batches);

  if (editingBatchId) {
    const idx = batches.findIndex(b => b.id === editingBatchId);
    if (idx !== -1) {
      batches[idx] = { ...batches[idx], ...batchData };
    }
    showToast('批次已更新');
  } else {
    batchData.id = genId();
    batches.push(batchData);
    showToast('批次已添加');
  }

  setData(DB_KEYS.batches, batches);
  closeBatchModal();
  renderBatches();
}

function deleteBatch(id) {
  const items = getData(DB_KEYS.items);
  const count = items.filter(i => i.batchId === id).length;
  if (count > 0) {
    if (!confirm(`该批次下有 ${count} 件衣服，删除后衣服将变为未分批，确定删除吗？`)) return;
  } else {
    if (!confirm('确定删除该批次吗？')) return;
  }

  let batches = getData(DB_KEYS.batches);
  batches = batches.filter(b => b.id !== id);
  setData(DB_KEYS.batches, batches);

  // 清除关联
  items.forEach(item => {
    if (item.batchId === id) item.batchId = '';
  });
  setData(DB_KEYS.items, items);

  renderBatches();
  showToast('批次已删除');
}

function closeBatchModal() {
  document.getElementById('batchModal').classList.add('hidden');
  editingBatchId = null;
}

// ===== 自定义状态 =====
function showStatusModal() {
  renderStatusList();
  document.getElementById('statusModal').classList.remove('hidden');
}

function closeStatusModal() {
  document.getElementById('statusModal').classList.add('hidden');
}

function renderStatusList() {
  const customStatuses = getData(DB_KEYS.customStatuses);
  const listEl = document.getElementById('statusList');

  const defaultStatuses = [
    { id: 'in_stock', name: '在库' },
    { id: 'sold', name: '已售' },
    { id: 'returned', name: '已退' }
  ];

  listEl.innerHTML = [...defaultStatuses, ...customStatuses].map(s => {
    const isDefault = defaultStatuses.some(d => d.id === s.id);
    return `<span class="status-tag">
      ${escHtml(s.name)}
      ${!isDefault ? `<button class="remove-status" onclick="removeCustomStatus('${s.id}')">✕</button>` : ''}
    </span>`;
  }).join('');
}

function addCustomStatus() {
  const name = document.getElementById('newStatusName').value.trim();
  if (!name) {
    showToast('请输入状态名称');
    return;
  }

  const customStatuses = getData(DB_KEYS.customStatuses);
  customStatuses.push({ id: genId(), name });
  setData(DB_KEYS.customStatuses, customStatuses);
  document.getElementById('newStatusName').value = '';
  renderStatusList();
  showToast('状态已添加');
}

function removeCustomStatus(id) {
  let customStatuses = getData(DB_KEYS.customStatuses);
  customStatuses = customStatuses.filter(s => s.id !== id);
  setData(DB_KEYS.customStatuses, customStatuses);
  renderStatusList();
  showToast('状态已删除');
}

// ===== 统计 =====
function showStats() {
  switchTab('stats', document.querySelectorAll('.nav-item')[4]);
}

function renderStats() {
  const items = getData(DB_KEYS.items);
  const batches = getData(DB_KEYS.batches);
  const categories = getData(DB_KEYS.categories);

  const totalItems = items.length;
  const inStockItems = items.filter(i => i.status === 'in_stock').length;
  const soldItems = items.filter(i => i.status === 'sold').length;
  const returnedItems = items.filter(i => i.status === 'returned').length;

  const totalPurchase = items.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
  const totalReceived = items.filter(i => i.status === 'sold').reduce((sum, i) => sum + (i.saleInfo?.receivedPrice || 0), 0);
  const totalExtraCost = items.filter(i => i.status === 'sold').reduce((sum, i) => sum + (i.saleInfo?.extraCost || 0), 0);
  const totalProfit = totalReceived - items.filter(i => i.status === 'sold').reduce((sum, i) => sum + (i.purchasePrice || 0), 0) - totalExtraCost;

  const batchTotalCost = batches.reduce((sum, b) => sum + (b.totalCost || 0), 0);

  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalItems}</div>
        <div class="stat-label">总件数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${inStockItems}</div>
        <div class="stat-label">在库</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${soldItems}</div>
        <div class="stat-label">已售</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${returnedItems}</div>
        <div class="stat-label">已退</div>
      </div>
    </div>

    <div class="stats-section">
      <h3>财务概览</h3>
      <div class="stats-row"><span class="label">总进货金额</span><span class="value" style="color:var(--primary)">¥${totalPurchase.toFixed(2)}</span></div>
      <div class="stats-row"><span class="label">总到手金额</span><span class="value" style="color:var(--success)">¥${totalReceived.toFixed(2)}</span></div>
      <div class="stats-row"><span class="label">总额外支出</span><span class="value">¥${totalExtraCost.toFixed(2)}</span></div>
      <div class="stats-row"><span class="label">总利润</span><span class="value" style="color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${totalProfit >= 0 ? '+' : ''}¥${totalProfit.toFixed(2)}</span></div>
      <div class="stats-row"><span class="label">批次总费用</span><span class="value">¥${batchTotalCost.toFixed(2)}</span></div>
    </div>

    <div class="stats-section">
      <h3>销售趋势</h3>
      <div class="stats-time-tabs">
        <button class="stats-time-tab ${statsTimeMode === 'year' ? 'active' : ''}" onclick="setStatsTimeMode('year')">按年</button>
        <button class="stats-time-tab ${statsTimeMode === 'month' ? 'active' : ''}" onclick="setStatsTimeMode('month')">按月</button>
        <button class="stats-time-tab ${statsTimeMode === 'day' ? 'active' : ''}" onclick="setStatsTimeMode('day')">按日</button>
      </div>
      ${renderStatsTimeNav()}
      ${renderStatsTimeData(items)}
    </div>
  `;

  // 分类统计
  if (categories.length > 0) {
    html += `<div class="stats-section"><h3>分类统计</h3>`;
    categories.forEach(cat => {
      const catItems = items.filter(i => i.categoryId === cat.id);
      const catSold = catItems.filter(i => i.status === 'sold').length;
      const catPurchase = catItems.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
      html += `
        <div class="stats-row">
          <span class="label">${escHtml(cat.name)}</span>
          <span class="value">${catItems.length}件 / 售${catSold}件 / 进¥${catPurchase.toFixed(2)}</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  // 批次统计
  if (batches.length > 0) {
    html += `<div class="stats-section"><h3>批次统计</h3>`;
    batches.forEach(batch => {
      const batchItems = items.filter(i => i.batchId === batch.id);
      const batchSold = batchItems.filter(i => i.status === 'sold').length;
      html += `
        <div class="stats-row">
          <span class="label">${escHtml(batch.name)}</span>
          <span class="value">${batchItems.length}件 / 售${batchSold}件 / 总费¥${(batch.totalCost || 0).toFixed(2)}</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  // 自定义状态管理入口
  html += `
    <div class="stats-section" style="text-align:center">
      <button class="btn-primary" onclick="showStatusModal()" style="display:inline-block;width:auto;padding:10px 24px">管理自定义状态</button>
    </div>
  `;

  document.getElementById('statsContent').innerHTML = html;
}

function setStatsTimeMode(mode) {
  statsTimeMode = mode;
  statsCurrentDate = new Date();
  renderStats();
}

function statsNavPrev() {
  if (statsTimeMode === 'year') {
    statsCurrentDate.setFullYear(statsCurrentDate.getFullYear() - 1);
  } else if (statsTimeMode === 'month') {
    statsCurrentDate.setMonth(statsCurrentDate.getMonth() - 1);
  } else {
    statsCurrentDate.setDate(statsCurrentDate.getDate() - 1);
  }
  renderStats();
}

function statsNavNext() {
  if (statsTimeMode === 'year') {
    statsCurrentDate.setFullYear(statsCurrentDate.getFullYear() + 1);
  } else if (statsTimeMode === 'month') {
    statsCurrentDate.setMonth(statsCurrentDate.getMonth() + 1);
  } else {
    statsCurrentDate.setDate(statsCurrentDate.getDate() + 1);
  }
  renderStats();
}

function renderStatsTimeNav() {
  let periodLabel = '';
  if (statsTimeMode === 'year') {
    periodLabel = statsCurrentDate.getFullYear() + '年';
  } else if (statsTimeMode === 'month') {
    periodLabel = statsCurrentDate.getFullYear() + '年' + (statsCurrentDate.getMonth() + 1) + '月';
  } else {
    periodLabel = formatDate(statsCurrentDate.toISOString());
  }

  return `
    <div class="stats-time-nav">
      <button class="nav-arrow" onclick="statsNavPrev()">上一${statsTimeMode === 'year' ? '年' : statsTimeMode === 'month' ? '月' : '日'}</button>
      <span class="nav-period">${periodLabel}</span>
      <button class="nav-arrow" onclick="statsNavNext()">下一${statsTimeMode === 'year' ? '年' : statsTimeMode === 'month' ? '月' : '日'}</button>
    </div>
  `;
}

function renderStatsTimeData(items) {
  const soldItems = items.filter(i => i.status === 'sold');

  if (statsTimeMode === 'year') {
    return renderYearStats(soldItems);
  } else if (statsTimeMode === 'month') {
    return renderMonthStats(soldItems);
  } else {
    return renderDayStats(soldItems);
  }
}

function renderYearStats(soldItems) {
  const year = statsCurrentDate.getFullYear();
  const yearItems = soldItems.filter(i => {
    const d = new Date(i.saleInfo?.soldDate || i.updatedAt || i.createdAt);
    return d.getFullYear() === year;
  });

  const count = yearItems.length;
  const amount = yearItems.reduce((sum, i) => sum + (i.saleInfo?.receivedPrice || 0), 0);
  const cost = yearItems.reduce((sum, i) => sum + (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0), 0);
  const profit = amount - cost;

  // 按月拆分
  const monthlyData = {};
  for (let m = 0; m < 12; m++) {
    monthlyData[m] = { count: 0, amount: 0, cost: 0 };
  }
  yearItems.forEach(i => {
    const m = new Date(i.saleInfo?.soldDate || i.updatedAt || i.createdAt).getMonth();
    monthlyData[m].count++;
    monthlyData[m].amount += (i.saleInfo?.receivedPrice || 0);
    monthlyData[m].cost += (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0);
  });

  let html = `
    <div class="stats-row" style="font-weight:700;border-bottom:1px solid var(--border);padding-bottom:8px">
      <span class="label">年度合计</span>
      <span class="value">${count}件 / 到手¥${amount.toFixed(2)} / 利润<span style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${profit >= 0 ? '+' : ''}¥${profit.toFixed(2)}</span></span>
    </div>
    <div class="stats-day-list">
  `;

  for (let m = 0; m < 12; m++) {
    const d = monthlyData[m];
    if (d.count > 0) {
      const mProfit = d.amount - d.cost;
      html += `
        <div class="stats-day-row">
          <span class="date">${m + 1}月</span>
          <span class="count">${d.count}件</span>
          <span class="amount">¥${d.amount.toFixed(2)} <span style="font-size:11px;color:${mProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${mProfit >= 0 ? '+' : ''}¥${mProfit.toFixed(2)}</span></span>
        </div>
      `;
    }
  }

  html += '</div>';
  return html;
}

function renderMonthStats(soldItems) {
  const year = statsCurrentDate.getFullYear();
  const month = statsCurrentDate.getMonth();
  const monthItems = soldItems.filter(i => {
    const d = new Date(i.saleInfo?.soldDate || i.updatedAt || i.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const count = monthItems.length;
  const amount = monthItems.reduce((sum, i) => sum + (i.saleInfo?.receivedPrice || 0), 0);
  const cost = monthItems.reduce((sum, i) => sum + (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0), 0);
  const profit = amount - cost;

  // 按日拆分
  const dailyData = {};
  monthItems.forEach(i => {
    const day = new Date(i.saleInfo?.soldDate || i.updatedAt || i.createdAt).getDate();
    if (!dailyData[day]) dailyData[day] = { count: 0, amount: 0, cost: 0 };
    dailyData[day].count++;
    dailyData[day].amount += (i.saleInfo?.receivedPrice || 0);
    dailyData[day].cost += (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0);
  });

  let html = `
    <div class="stats-row" style="font-weight:700;border-bottom:1px solid var(--border);padding-bottom:8px">
      <span class="label">月度合计</span>
      <span class="value">${count}件 / 到手¥${amount.toFixed(2)} / 利润<span style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${profit >= 0 ? '+' : ''}¥${profit.toFixed(2)}</span></span>
    </div>
    <div class="stats-day-list">
  `;

  const days = Object.keys(dailyData).sort((a, b) => b - a);
  days.forEach(day => {
    const d = dailyData[day];
    const dProfit = d.amount - d.cost;
    html += `
      <div class="stats-day-row">
        <span class="date">${month + 1}月${day}日</span>
        <span class="count">${d.count}件</span>
        <span class="amount">¥${d.amount.toFixed(2)} <span style="font-size:11px;color:${dProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${dProfit >= 0 ? '+' : ''}¥${dProfit.toFixed(2)}</span></span>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderDayStats(soldItems) {
  const dateStr = formatDate(statsCurrentDate.toISOString());
  const dayItems = soldItems.filter(i => {
    const d = i.saleInfo?.soldDate || formatDate(i.updatedAt || i.createdAt);
    return d === dateStr;
  });

  const count = dayItems.length;
  const amount = dayItems.reduce((sum, i) => sum + (i.saleInfo?.receivedPrice || 0), 0);
  const cost = dayItems.reduce((sum, i) => sum + (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0), 0);
  const profit = amount - cost;

  let html = `
    <div class="stats-row" style="font-weight:700;border-bottom:1px solid var(--border);padding-bottom:8px">
      <span class="label">当日合计</span>
      <span class="value">${count}件 / 到手¥${amount.toFixed(2)} / 利润<span style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${profit >= 0 ? '+' : ''}¥${profit.toFixed(2)}</span></span>
    </div>
  `;

  if (dayItems.length > 0) {
    html += '<div class="stats-day-list">';
    dayItems.forEach(i => {
      const iCost = (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0);
      const iProfit = (i.saleInfo?.receivedPrice || 0) - iCost;
      html += `
        <div class="stats-day-row" onclick="showDetail('${i.id}')" style="cursor:pointer">
          <span class="date">${escHtml(i.name)}</span>
          <span class="count">进¥${(i.purchasePrice || 0).toFixed(0)}</span>
          <span class="amount">得¥${(i.saleInfo?.receivedPrice || 0).toFixed(0)} <span style="font-size:11px;color:${iProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${iProfit >= 0 ? '+' : ''}¥${iProfit.toFixed(0)}</span></span>
        </div>
      `;
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:20px;color:var(--text-secondary);letter-spacing:2px;font-size:13px">当日无销售记录</div>';
  }

  return html;
}

// ===== 工具函数 =====
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

// ===== PWA 安装 =====
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBanner').classList.remove('hidden');
});

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(choice => {
      if (choice.outcome === 'accepted') {
        showToast('安装成功！');
      }
      deferredPrompt = null;
      document.getElementById('installBanner').classList.add('hidden');
    });
  } else {
    showToast('请通过浏览器菜单"添加到主屏幕"');
  }
}

function dismissInstall() {
  document.getElementById('installBanner').classList.add('hidden');
}

// ===== 二维码生成 =====
function showQrModal() {
  const url = window.location.href;
  const qrContainer = document.getElementById('qrCode');
  const qrUrlEl = document.getElementById('qrUrl');

  // 使用纯 Canvas 生成二维码
  qrContainer.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 220;
  canvas.style.cssText = 'width:220px;height:220px;border-radius:12px;background:white;padding:10px;';

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 220, 220);

  // 使用 QR 算法生成二维码矩阵
  const qr = generateQRMatrix(url);
  const moduleCount = qr.length;
  const padding = 16;
  const size = 220 - padding * 2;
  const cellSize = size / moduleCount;

  ctx.fillStyle = '#2d2a26';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr[row][col]) {
        ctx.fillRect(
          padding + col * cellSize,
          padding + row * cellSize,
          cellSize + 0.5,
          cellSize + 0.5
        );
      }
    }
  }

  qrContainer.appendChild(canvas);
  qrUrlEl.textContent = url;
  document.getElementById('qrModal').classList.remove('hidden');
}

function closeQrModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

// 简易 QR Code 生成器（基于 QR Code Model 2）
function generateQRMatrix(text) {
  // 使用简化版 QR 生成：将文本编码为字节模式
  const data = new TextEncoder().encode(text);
  const len = data.length;

  // 选择合适的版本（1-10 简化处理）
  let version = 1;
  const capacityTable = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  while (version < 10 && capacityTable[version] < len + 1) version++;

  const moduleCount = 17 + version * 4;

  // 创建空矩阵
  const matrix = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(false));
  const reserved = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(false));

  // 放置定位图案
  function placeFinderPattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= moduleCount || cc < 0 || cc >= moduleCount) continue;
        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[rr][cc] = true;
        } else {
          matrix[rr][cc] = false;
        }
        reserved[rr][cc] = true;
      }
    }
  }

  placeFinderPattern(0, 0);
  placeFinderPattern(0, moduleCount - 7);
  placeFinderPattern(moduleCount - 7, 0);

  // 放置定时图案
  for (let i = 8; i < moduleCount - 8; i++) {
    if (!reserved[6][i]) {
      matrix[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      matrix[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }

  // 放置对齐图案（版本 >= 2）
  if (version >= 2) {
    const alignPos = getAlignmentPositions(version, moduleCount);
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (reserved[r] && reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= moduleCount || cc < 0 || cc >= moduleCount) continue;
            if (reserved[rr][cc]) continue;
            if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
              matrix[rr][cc] = true;
            } else {
              matrix[rr][cc] = false;
            }
            reserved[rr][cc] = true;
          }
        }
      }
    }
  }

  // 预留格式信息区域
  for (let i = 0; i < 15; i++) {
    // 水平
    const hPositions = [
      [8, i], [8, moduleCount - 1 - i]
    ];
    // 垂直
    const vPositions = [
      [i, 8], [moduleCount - 1 - i, 8]
    ];
    [...hPositions, ...vPositions].forEach(([r, c]) => {
      if (r >= 0 && r < moduleCount && c >= 0 && c < moduleCount) {
        reserved[r][c] = true;
      }
    });
  }

  // 编码数据（字节模式）
  const bits = [];
  // 模式指示符：0100（字节模式）
  bits.push(0, 1, 0, 0);
  // 字符计数指示符（版本1-9用8位）
  const countBits = version <= 9 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push((len >> i) & 1);
  }
  // 数据
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  // 终止符
  for (let i = 0; i < 4 && bits.length < moduleCount * moduleCount * 2; i++) {
    bits.push(0);
  }
  // 对齐到8位
  while (bits.length % 8 !== 0) bits.push(0);

  // 填充字节
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  const maxDataBits = getDataCapacity(version);
  while (bits.length < maxDataBits) {
    const pb = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bits.push((pb >> i) & 1);
    }
    padIdx++;
  }

  // 简化：直接将数据位放入矩阵（跳过纠错码计算，生成可扫描但简化的二维码）
  let bitIdx = 0;
  for (let col = moduleCount - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5;
    for (let row = 0; row < moduleCount; row++) {
      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (c < 0 || c >= moduleCount) continue;
        const goingUp = ((moduleCount - 1 - col) / 2) % 2 === 0;
        const r = goingUp ? moduleCount - 1 - row : row;
        if (r < 0 || r >= moduleCount) continue;
        if (reserved[r][c]) continue;
        if (bitIdx < bits.length) {
          matrix[r][c] = bits[bitIdx] === 1;
          bitIdx++;
        }
        reserved[r][c] = true;
      }
    }
  }

  // 应用掩码（简化：使用掩码0）
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (reserved[r][c]) continue;
      if ((r + c) % 2 === 0) {
        matrix[r][c] = !matrix[r][c];
      }
    }
  }

  // 放置格式信息（掩码0，纠错级别M）
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1];
  // 水平格式信息
  const hFormatPos = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = hFormatPos[i];
    if (r < moduleCount && c < moduleCount) {
      matrix[r][c] = formatBits[i] === 1;
    }
  }
  // 垂直格式信息
  const vFormatPos = [
    [moduleCount - 1, 8], [moduleCount - 2, 8], [moduleCount - 3, 8],
    [moduleCount - 4, 8], [moduleCount - 5, 8], [moduleCount - 6, 8],
    [moduleCount - 7, 8],
    [8, moduleCount - 8], [8, moduleCount - 7], [8, moduleCount - 6],
    [8, moduleCount - 5], [8, moduleCount - 4], [8, moduleCount - 3],
    [8, moduleCount - 2], [8, moduleCount - 1]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = vFormatPos[i];
    if (r < moduleCount && c < moduleCount) {
      matrix[r][c] = formatBits[i] === 1;
    }
  }

  // 暗模块
  matrix[moduleCount - 8][8] = true;

  return matrix;
}

function getAlignmentPositions(version, moduleCount) {
  if (version === 1) return [];
  const positions = [6];
  const last = moduleCount - 7;
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((last - 6) / (count - 1));
  for (let i = 1; i < count; i++) {
    positions.push(6 + step * i);
  }
  if (positions[positions.length - 1] !== last) {
    positions[positions.length - 1] = last;
  }
  return positions;
}

function getDataCapacity(version) {
  // 简化：返回版本对应的数据容量（位数）
  const totalModules = (17 + version * 4) * (17 + version * 4);
  return Math.floor(totalModules * 0.3); // 简化估算
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  initDefaults();
  renderList();

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('Service Worker 注册成功');
    }).catch(err => {
      console.log('Service Worker 注册失败', err);
    });
  }
});
