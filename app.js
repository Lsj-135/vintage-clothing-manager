// ===== Firebase 同步配置 =====
let firebaseEnabled = false;
let syncInProgress = false;
let lastSyncTime = 0;

// 检查 Firebase 是否可用
function isFirebaseAvailable() {
  return window.firebaseDB && window.firebaseSetDoc && window.firebaseGetDoc;
}

// 同步数据到 Firebase
async function syncToFirebase() {
  if (!isFirebaseAvailable() || syncInProgress) return;
  
  syncInProgress = true;
  try {
    const data = {
      items: getData(DB_KEYS.items),
      categories: getData(DB_KEYS.categories),
      batches: getData(DB_KEYS.batches),
      customStatuses: getData(DB_KEYS.customStatuses),
      lastSync: new Date().toISOString()
    };
    
    await window.firebaseSetDoc(
      window.firebaseDoc(window.firebaseDB, 'data', 'main'), 
      data
    );
    
    lastSyncTime = Date.now();
    console.log('数据已同步到 Firebase');
  } catch (e) {
    console.error('同步到 Firebase 失败:', e);
  } finally {
    syncInProgress = false;
  }
}

// 从 Firebase 同步数据
async function syncFromFirebase() {
  if (!isFirebaseAvailable()) return false;
  
  try {
    const docSnap = await window.firebaseGetDoc(
      window.firebaseDoc(window.firebaseDB, 'data', 'main')
    );
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // 检查是否有新数据
      const localItems = getData(DB_KEYS.items);
      if (data.items && JSON.stringify(data.items) !== JSON.stringify(localItems)) {
        // 合并数据（避免覆盖本地未同步的数据）
        const mergedItems = mergeData(localItems, data.items);
        setData(DB_KEYS.items, mergedItems);
      }
      
      if (data.categories) setData(DB_KEYS.categories, data.categories);
      if (data.batches) setData(DB_KEYS.batches, data.batches);
      if (data.customStatuses) setData(DB_KEYS.customStatuses, data.customStatuses);
      
      console.log('已从 Firebase 同步数据');
      return true;
    }
  } catch (e) {
    console.error('从 Firebase 同步失败:', e);
  }
  return false;
}

// 合并数据（根据更新时间）
function mergeData(localData, remoteData) {
  const merged = [...localData];
  const localIds = new Set(localData.map(item => item.id));
  
  remoteData.forEach(remoteItem => {
    const localIndex = merged.findIndex(item => item.id === remoteItem.id);
    if (localIndex === -1) {
      // 远程有新数据，添加
      merged.push(remoteItem);
    } else {
      // 比较更新时间，保留最新的
      const localDate = new Date(merged[localIndex].updatedAt || 0);
      const remoteDate = new Date(remoteItem.updatedAt || 0);
      if (remoteDate > localDate) {
        merged[localIndex] = remoteItem;
      }
    }
  });
  
  return merged;
}

// 设置实时监听
function setupRealtimeSync() {
  if (!isFirebaseAvailable()) return;
  
  window.firebaseOnSnapshot(
    window.firebaseDoc(window.firebaseDB, 'data', 'main'),
    (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const localItems = getData(DB_KEYS.items);
        
        // 检查数据是否有变化
        if (data.items && JSON.stringify(data.items) !== JSON.stringify(localItems)) {
          console.log('检测到远程数据变化，正在同步...');
          syncFromFirebase().then(() => {
            renderList();
            showToast('数据已同步');
          });
        }
      }
    }
  );
}

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
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    console.error('读取数据失败:', key, e);
    return [];
  }
}

function setData(key, data) {
  try {
    // 先验证数据
    if (!data || !Array.isArray(data)) {
      console.error('无效数据:', key);
      return false;
    }
    
    const jsonStr = JSON.stringify(data);
    if (!jsonStr) {
      console.error('数据序列化失败:', key);
      return false;
    }
    
    // 保存到 localStorage
    localStorage.setItem(key, jsonStr);
    
    // 验证保存成功
    const saved = localStorage.getItem(key);
    if (!saved) {
      throw new Error('保存验证失败');
    }
    
    // 自动同步到 Firebase
    syncToFirebase();
    
    // 自动备份到 IndexedDB
    autoBackup();
    // 提醒存手机
    showSaveReminder();
    return true;
  } catch (e) {
    console.error('保存数据失败:', key, e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showToast('存储空间不足，请导出备份后清理数据');
    } else {
      showToast('数据保存失败，请重试');
    }
    // 即使 localStorage 失败，仍尝试备份到 IndexedDB
    autoBackup();
    showSaveReminder();
    return false;
  }
}

// ===== 存手机提醒 =====
let saveReminderTimer = null;
let unsavedChanges = false;

function showSaveReminder() {
  unsavedChanges = true;
  const el = document.getElementById('saveReminder');
  if (!el) {
    console.warn('saveReminder 元素不存在');
    return;
  }
  // 延迟2秒显示，避免操作过程中频繁弹出
  if (saveReminderTimer) clearTimeout(saveReminderTimer);
  saveReminderTimer = setTimeout(() => {
    if (unsavedChanges) {
      el.classList.add('show');
      console.log('存手机提醒已显示');
    }
  }, 2000);
}

function hideSaveReminder() {
  const el = document.getElementById('saveReminder');
  if (el) el.classList.remove('show');
  unsavedChanges = false;
  if (saveReminderTimer) clearTimeout(saveReminderTimer);
}

// 检查存储使用量
function getStorageUsage() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length * 2; // UTF-16 每字符2字节
    }
  }
  return total;
}

function getStorageUsageMB() {
  return (getStorageUsage() / 1024 / 1024).toFixed(2);
}

// ===== IndexedDB 自动备份 =====
const BACKUP_DB_NAME = 'LiuShuiJ_Backup';
const BACKUP_DB_VERSION = 1;
const BACKUP_STORE = 'backups';
const MAX_BACKUPS = 3; // 保留最近3个备份版本
let backupDb = null;
let backupTimer = null;
let lastBackupTime = null;

// 初始化 IndexedDB
function initBackupDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);

      request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          const store = db.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = function(e) {
        backupDb = e.target.result;
        console.log('备份数据库就绪');
        resolve(backupDb);
      };

      request.onerror = function(e) {
        console.error('备份数据库打开失败:', e);
        reject(e);
      };
    } catch (e) {
      console.error('IndexedDB 不可用:', e);
      reject(e);
    }
  });
}

// 执行自动备份（防抖，500ms内只执行一次）
function autoBackup() {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    doBackup();
  }, 500);
}

let backupFailCount = 0; // 连续备份失败次数

// 实际执行备份
function doBackup() {
  if (!backupDb) return;

  try {
    const backupData = {
      id: 'auto_' + Date.now(),
      timestamp: new Date().toISOString(),
      items: getData(DB_KEYS.items),
      categories: getData(DB_KEYS.categories),
      batches: getData(DB_KEYS.batches),
      customStatuses: getData(DB_KEYS.customStatuses)
    };

    const tx = backupDb.transaction(BACKUP_STORE, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE);

    // 写入新备份
    const addReq = store.add(backupData);

    addReq.onsuccess = function() {
      lastBackupTime = new Date();
      backupFailCount = 0; // 重置失败计数
      // 清理旧备份，只保留最近 MAX_BACKUPS 个
      cleanupOldBackups();
    };

    addReq.onerror = function(e) {
      console.error('自动备份写入失败:', e);
      handleBackupError(e);
    };

    tx.onerror = function(e) {
      console.error('备份事务失败:', e);
      handleBackupError(e);
    };
  } catch (e) {
    console.error('自动备份异常:', e);
    handleBackupError(e);
  }
}

// 处理备份失败
function handleBackupError(e) {
  backupFailCount++;

  // 第一次失败静默，连续失败才提示
  if (backupFailCount === 2) {
    showToast('自动备份失败，存储空间可能不足');
  } else if (backupFailCount >= 5) {
    // 连续5次失败，强制清理旧备份腾空间
    showToast('备份多次失败，正在清理旧备份...');
    forceCleanupBackups();
  }
}

// 强制清理所有旧备份，只留最新1个
function forceCleanupBackups() {
  if (!backupDb) return;

  try {
    const tx = backupDb.transaction(BACKUP_STORE, 'readonly');
    const store = tx.objectStore(BACKUP_STORE);
    const index = store.index('timestamp');

    const allBackups = [];
    index.openCursor().onsuccess = function(e) {
      const cursor = e.target.result;
      if (cursor) {
        allBackups.push({ id: cursor.value.id, timestamp: cursor.value.timestamp });
        cursor.continue();
      } else {
        if (allBackups.length > 1) {
          allBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          // 只保留最新1个
          const toDelete = allBackups.slice(1);
          const delTx = backupDb.transaction(BACKUP_STORE, 'readwrite');
          const delStore = delTx.objectStore(BACKUP_STORE);
          toDelete.forEach(b => delStore.delete(b.id));

          delTx.oncomplete = function() {
            // 清理后重试备份
            backupFailCount = 0;
            setTimeout(() => doBackup(), 500);
          };
        }
      }
    };
  } catch (e) {
    console.error('强制清理备份失败:', e);
  }
}

// 清理旧备份
function cleanupOldBackups() {
  if (!backupDb) return;

  try {
    const tx = backupDb.transaction(BACKUP_STORE, 'readonly');
    const store = tx.objectStore(BACKUP_STORE);
    const index = store.index('timestamp');

    const allBackups = [];
    index.openCursor().onsuccess = function(e) {
      const cursor = e.target.result;
      if (cursor) {
        allBackups.push({ id: cursor.value.id, timestamp: cursor.value.timestamp });
        cursor.continue();
      } else {
        // 排序后删除多余的
        if (allBackups.length > MAX_BACKUPS) {
          allBackups.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          const toDelete = allBackups.slice(0, allBackups.length - MAX_BACKUPS);
          const delTx = backupDb.transaction(BACKUP_STORE, 'readwrite');
          const delStore = delTx.objectStore(BACKUP_STORE);
          toDelete.forEach(b => {
            delStore.delete(b.id);
          });
        }
      }
    };
  } catch (e) {
    console.error('清理旧备份失败:', e);
  }
}

// 获取备份列表
function getBackupList() {
  return new Promise((resolve) => {
    if (!backupDb) { resolve([]); return; }

    try {
      const tx = backupDb.transaction(BACKUP_STORE, 'readonly');
      const store = tx.objectStore(BACKUP_STORE);
      const index = store.index('timestamp');

      const backups = [];
      index.openCursor().onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          backups.push({
            id: val.id,
            timestamp: val.timestamp,
            itemCount: val.items ? val.items.length : 0,
            categoryCount: val.categories ? val.categories.length : 0
          });
          cursor.continue();
        } else {
          backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(backups);
        }
      };
    } catch (e) {
      console.error('获取备份列表失败:', e);
      resolve([]);
    }
  });
}

// 从 IndexedDB 恢复备份
function restoreFromBackup(backupId) {
  return new Promise((resolve) => {
    if (!backupDb) { resolve(false); return; }

    try {
      const tx = backupDb.transaction(BACKUP_STORE, 'readonly');
      const store = tx.objectStore(BACKUP_STORE);
      const req = store.get(backupId);

      req.onsuccess = function(e) {
        const backup = e.target.result;
        if (!backup) { resolve(false); return; }

        if (!confirm(`确认恢复此备份？\n\n备份时间: ${new Date(backup.timestamp).toLocaleString()}\n衣物数量: ${backup.items ? backup.items.length : 0}\n\n当前数据将被覆盖！`)) {
          resolve(false);
          return;
        }

        setData(DB_KEYS.items, backup.items || []);
        setData(DB_KEYS.categories, backup.categories || []);
        setData(DB_KEYS.batches, backup.batches || []);
        setData(DB_KEYS.customStatuses, backup.customStatuses || []);

        // 恢复完成后隐藏存手机提醒（恢复不算新数据）
        hideSaveReminder();

        showToast('备份已恢复');
        resolve(true);
      };

      req.onerror = function() {
        showToast('恢复失败');
        resolve(false);
      };
    } catch (e) {
      console.error('恢复备份失败:', e);
      resolve(false);
    }
  });
}

// 启动时检测数据丢失并自动恢复
function checkAndAutoRecover() {
  if (!backupDb) return;

  const items = getData(DB_KEYS.items);

  // 如果 localStorage 数据为空，检查 IndexedDB 是否有备份
  if (items.length === 0) {
    getBackupList().then(backups => {
      if (backups.length > 0) {
        const latest = backups[0];
        if (latest.itemCount > 0) {
          if (confirm(`检测到数据丢失！\n\n发现最近备份: ${new Date(latest.timestamp).toLocaleString()}\n包含 ${latest.itemCount} 件衣物\n\n是否恢复？`)) {
            restoreFromBackup(latest.id).then(ok => {
              if (ok) {
                renderList();
              }
            });
          }
        }
      }
    });
  }
}

// 获取最近备份时间文字
function getLastBackupText() {
  if (!lastBackupTime) return '尚未备份';
  const diff = Date.now() - lastBackupTime.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
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
  // 恢复底部导航
  document.querySelector('.bottom-nav').classList.remove('hidden');
  // 重置底部导航高亮
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item').classList.add('active');
}

function switchTab(tab, btn) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // 确保底部导航可见
  document.querySelector('.bottom-nav').classList.remove('hidden');

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
    const statusClass = getStatusClass(item.status);

    return `
      <div class="clothes-card" onclick="showDetail('${item.id}')">
        <div class="card-image">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" loading="lazy">` : (cat ? escHtml(cat.name) : '衣物')}
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

  // 使用已有的 categories 数据渲染筛选器，避免重复 JSON.parse
  renderCategoryFiltersWith(categories, items);
}

function renderCategoryFilters() {
  const categories = getData(DB_KEYS.categories);
  const items = getData(DB_KEYS.items);
  renderCategoryFiltersWith(categories, items);
}

function renderCategoryFiltersWith(categories, items) {
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
  document.querySelector('.bottom-nav').classList.add('hidden');
}

function editCurrentItem() {
  if (!currentDetailId) return;
  editingItemId = currentDetailId;
  document.getElementById('formTitle').textContent = '编辑衣服';
  populateSelects();
  loadItemToForm(editingItemId);
  showPage('pageForm');
  document.querySelector('.bottom-nav').classList.add('hidden');
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
      extraCost: editingItemId ? (items.find(i => i.id === editingItemId)?.saleInfo?.extraCost || 0) : 0,
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

  // 检查存储空间
  const usage = getStorageUsageMB();
  if (parseFloat(usage) > 4.5) {
    showToast('存储空间已满，请先导出备份并清理旧数据');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      const maxSize = 600;
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

      currentImageData = canvas.toDataURL('image/jpeg', 0.5);

      // 再次检查存储
      const testItems = getData(DB_KEYS.items);
      const testData = [...testItems];
      const testItem = { id: 'test', image: currentImageData };
      testData.push(testItem);
      try {
        const testStr = JSON.stringify(testData);
        if (testStr.length * 2 > 4.5 * 1024 * 1024) {
          showToast('图片太大，存储空间不足');
          currentImageData = null;
          return;
        }
      } catch(e) {
        // ignore
      }

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
  document.querySelector('.bottom-nav').classList.add('hidden');
}
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
  document.querySelector('.bottom-nav').classList.add('hidden');
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

// ===== 尺码表 =====
const SIZE_DATA = {
  womenTops: {
    name: '女上装',
    headers: ['国际', '中国', '胸围cm', '腰围cm', '臀围cm', '美国', '英国', '欧盟', '日本', '韩国'],
    rows: [
      ['XS', '155/76A', '76-80', '60-64', '84-88', '0-2', '4-6', '32-34', '5-7', '44'],
      ['S', '160/80A', '80-84', '64-68', '88-92', '4-6', '8-10', '36-38', '9-11', '55'],
      ['M', '165/84A', '84-88', '68-72', '92-96', '8-10', '12-14', '40-42', '13-15', '66'],
      ['L', '170/88A', '88-92', '72-76', '96-100', '12-14', '16-18', '44-46', '17-19', '77'],
      ['XL', '175/92A', '92-96', '76-80', '100-104', '16-18', '20-22', '48-50', '21-23', '88'],
      ['XXL', '180/96A', '96-100', '80-84', '104-108', '20-22', '24-26', '52-54', '25-27', '99'],
    ]
  },
  womenDress: {
    name: '女裙装',
    headers: ['国际', '中国', '胸围cm', '腰围cm', '臀围cm', '美国', '英国', '欧盟', '日本', '韩国'],
    rows: [
      ['XS', '155/76A', '76-80', '60-64', '84-88', '0-2', '4-6', '32-34', '5-7', '44'],
      ['S', '160/80A', '80-84', '64-68', '88-92', '4-6', '8-10', '36-38', '9-11', '55'],
      ['M', '165/84A', '84-88', '68-72', '92-96', '8-10', '12-14', '40-42', '13-15', '66'],
      ['L', '170/88A', '88-92', '72-76', '96-100', '12-14', '16-18', '44-46', '17-19', '77'],
      ['XL', '175/92A', '92-96', '76-80', '100-104', '16-18', '20-22', '48-50', '21-23', '88'],
    ]
  },
  womenPants: {
    name: '女裤装',
    headers: ['国际', '中国', '腰围cm', '臀围cm', '裤长cm', '美国', '英国', '欧盟', '日本', '韩国'],
    rows: [
      ['XS', '155/62A', '62-66', '84-88', '94', '24-25', '6-8', '34-36', '5-7', '44'],
      ['S', '160/66A', '66-70', '88-92', '97', '26-27', '10-12', '38-40', '9-11', '55'],
      ['M', '165/70A', '70-74', '92-96', '100', '28-29', '14-16', '42-44', '13-15', '66'],
      ['L', '170/74A', '74-78', '96-100', '103', '30-31', '18-20', '46-48', '17-19', '77'],
      ['XL', '175/78A', '78-82', '100-104', '106', '32-33', '22-24', '50-52', '21-23', '88'],
    ]
  },
  menTops: {
    name: '男上装',
    headers: ['国际', '中国', '胸围cm', '腰围cm', '肩宽cm', '美国', '英国', '欧盟', '日本', '韩国'],
    rows: [
      ['S', '165/84A', '84-88', '72-76', '42-44', '34-36', '34-36', '44-46', 'S', '90'],
      ['M', '170/88A', '88-92', '76-80', '44-46', '38-40', '38-40', '48-50', 'M', '95'],
      ['L', '175/92A', '92-96', '80-84', '46-48', '42-44', '42-44', '52-54', 'L', '100'],
      ['XL', '180/96A', '96-100', '84-88', '48-50', '46-48', '46-48', '56-58', 'LL', '105'],
      ['XXL', '185/100A', '100-104', '88-92', '50-52', '50-52', '50-52', '60-62', '3L', '110'],
    ]
  },
  shoes: {
    name: '鞋码',
    headers: ['中国', '脚长cm', '美国(女)', '美国(男)', '英国', '欧盟', '日本', '韩国mm'],
    rows: [
      ['35', '22.0', '5', '3.5', '2.5', '35', '22', '230'],
      ['36', '22.5', '6', '4.5', '3.5', '36', '23', '235'],
      ['37', '23.0', '7', '5.5', '4.5', '37', '23.5', '240'],
      ['38', '23.5', '7.5', '6', '5', '38', '24', '245'],
      ['39', '24.5', '8.5', '7', '6', '39', '24.5', '250'],
      ['40', '25.0', '9', '7.5', '6.5', '40', '25', '255'],
      ['41', '25.5', '9.5', '8.5', '7.5', '41', '25.5', '260'],
      ['42', '26.0', '10', '9', '8', '42', '26', '265'],
      ['43', '26.5', '11', '10', '9', '43', '26.5', '270'],
      ['44', '27.0', '11.5', '10.5', '9.5', '44', '27', '275'],
      ['45', '27.5', '12', '11', '10', '45', '27.5', '280'],
    ]
  },
  ring: {
    name: '戒指',
    headers: ['中国', '美国', '英国', '欧盟', '日本', '周长mm', '直径mm', '内径cm'],
    rows: [
      ['5', '1', 'A', '41', '1', '39.8', '12.7', '1.27'],
      ['7', '2', 'B', '42', '2', '40.9', '13.0', '1.30'],
      ['9', '3', 'D', '44', '4', '43.0', '13.7', '1.37'],
      ['11', '4', 'F', '46', '6', '45.0', '14.3', '1.43'],
      ['13', '5', 'H', '48', '8', '46.8', '14.9', '1.49'],
      ['15', '6', 'J', '50', '10', '48.7', '15.5', '1.55'],
      ['17', '7', 'K½', '51½', '12', '50.0', '15.9', '1.59'],
      ['18', '8', 'M', '53', '14', '51.5', '16.4', '1.64'],
      ['20', '9', 'N½', '54½', '16', '52.8', '16.8', '1.68'],
      ['22', '10', 'P', '56', '18', '54.0', '17.2', '1.72'],
      ['24', '11', 'Q½', '57½', '20', '55.3', '17.6', '1.76'],
      ['25', '12', 'S', '59', '22', '56.6', '18.0', '1.80'],
      ['27', '13', 'T½', '60½', '24', '57.8', '18.4', '1.84'],
    ]
  },
  bra: {
    name: '内衣',
    headers: ['下胸围cm', '中国', '美国', '英国', '欧盟', '日本', '国际', '罩杯差cm'],
    rows: [
      ['68-72', '70/32', '32', '32', '70', '65', '70', 'A:10 B:12.5 C:15 D:17.5'],
      ['73-77', '75/34', '34', '34', '75', '70', '75', 'A:10 B:12.5 C:15 D:17.5'],
      ['78-82', '80/36', '36', '36', '80', '75', '80', 'A:10 B:12.5 C:15 D:17.5'],
      ['83-87', '85/38', '38', '38', '85', '80', '85', 'A:10 B:12.5 C:15 D:17.5'],
      ['88-92', '90/40', '40', '40', '90', '85', '90', 'A:10 B:12.5 C:15 D:17.5'],
      ['93-97', '95/42', '42', '42', '95', '90', '95', 'A:10 B:12.5 C:15 D:17.5'],
    ]
  }
};

let currentSizeCategory = 'womenTops';

function showSizeChart() {
  showPage('pageSizeChart');
  document.querySelector('.bottom-nav').classList.add('hidden');
  renderSizeChart();
}

function renderSizeChart() {
  const container = document.getElementById('sizeChartContent');
  const categories = Object.keys(SIZE_DATA);

  let html = '<div class="size-category-tabs">';
  categories.forEach(key => {
    const active = key === currentSizeCategory ? 'active' : '';
    html += `<button class="size-tab ${active}" onclick="switchSizeTab('${key}')">${SIZE_DATA[key].name}</button>`;
  });
  html += '</div>';

  const data = SIZE_DATA[currentSizeCategory];

  html += '<div class="size-table-wrap">';
  html += '<table class="size-table"><thead><tr>';
  data.headers.forEach(h => {
    html += `<th>${h}</th>`;
  });
  html += '</tr></thead><tbody>';
  data.rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      html += `<td>${cell}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // 测量方法提示
  html += `
    <div class="size-section-title">测量方法</div>
    <div class="size-note">
      衣长：肩线最高点至下摆<br>
      胸围：腋下水平绕胸一周<br>
      腰围：腰部最细处水平一周<br>
      肩宽：两肩端点之间的距离<br>
      袖长：肩端点至袖口<br>
      臀围：臀部最丰满处水平一周<br>
      戒指：用细线绕手指一圈量周长<br>
      脚长：脚后跟至最长脚趾的距离
    </div>
  `;

  container.innerHTML = html;
}

function switchSizeTab(key) {
  currentSizeCategory = key;
  renderSizeChart();
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

  // 自定义状态管理入口 + 数据管理
  html += `
    <div class="stats-section">
      <h3>存储状态</h3>
      <div class="stats-row"><span class="label">版本</span><span class="value">v2.0</span></div>
      <div class="stats-row"><span class="label">云端同步</span><span class="value" style="color:${isFirebaseAvailable() ? 'var(--success)' : 'var(--text-secondary)'}">${isFirebaseAvailable() ? '已连接' : '未配置'}</span></div>
      <div class="stats-row"><span class="label">已用空间</span><span class="value">${getStorageUsageMB()} MB / 5 MB</span></div>
      <div class="stats-row"><span class="label">衣物数量</span><span class="value">${totalItems} 件</span></div>
      <div class="stats-row"><span class="label">自动备份</span><span class="value" id="backupStatusText">${backupDb ? (backupFailCount >= 2 ? '异常' : '已开启') : '未开启'}</span></div>
      <div class="stats-row"><span class="label">最近备份</span><span class="value" id="lastBackupText">${backupFailCount >= 5 ? '多次失败' : getLastBackupText()}</span></div>
    </div>
    
    <div class="stats-section" style="text-align:center">
      <button class="btn-primary" onclick="syncToFirebase()" style="display:inline-block;width:auto;padding:10px 20px;margin:4px" ${!isFirebaseAvailable() ? 'disabled' : ''}>同步到云端</button>
      <button class="btn-secondary" onclick="syncFromFirebase()" style="display:inline-block;width:auto;padding:10px 20px;margin:4px" ${!isFirebaseAvailable() ? 'disabled' : ''}>从云端恢复</button>
    </div>

    <div class="stats-section" style="text-align:center">
      <button class="btn-primary" onclick="exportData()" style="display:inline-block;width:auto;padding:10px 20px;margin:4px">存到手机</button>
      <button class="btn-secondary" onclick="document.getElementById('importInput').click()" style="display:inline-block;width:auto;padding:10px 20px;margin:4px">导入恢复</button>
      <input type="file" id="importInput" accept=".json" hidden onchange="importData(this)">
    </div>

    <div style="padding:0 16px 8px;font-size:11px;color:var(--text-secondary);letter-spacing:1px;line-height:1.8">
      存到手机：点按钮 → 存储到文件 → 选"我的 iPhone"<br>
      恢复数据：点导入恢复 → 选之前存的 .json 文件
    </div>

    <div class="stats-section">
      <h3>备份记录</h3>
      <div id="backupListContainer" style="font-size:13px;color:var(--text-secondary);letter-spacing:1px">加载中...</div>
    </div>

    <div class="stats-section" style="text-align:center">
      <button class="btn-primary" onclick="showStatusModal()" style="display:inline-block;width:auto;padding:10px 24px">管理自定义状态</button>
      <button class="btn-secondary" onclick="generateTestData()" style="display:inline-block;width:auto;padding:10px 24px;margin-left:4px">生成测试数据</button>
      <button class="btn-secondary" onclick="clearCacheAndUpdate()" style="display:inline-block;width:auto;padding:10px 24px;margin-left:4px">清除缓存更新</button>
    </div>
  `;

  document.getElementById('statsContent').innerHTML = html;

  // 异步加载备份列表
  loadBackupList();
}

// 加载备份记录列表
async function loadBackupList() {
  const container = document.getElementById('backupListContainer');
  if (!container) return;

  try {
    const backups = await getBackupList();
    if (backups.length === 0) {
      container.innerHTML = '<p>暂无备份记录，添加衣物后将自动备份</p>';
      return;
    }

    let html = '';
    backups.forEach((b, i) => {
      const time = new Date(b.timestamp).toLocaleString();
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600;color:var(--text);letter-spacing:1px">${i === 0 ? '最新' : '备份 ' + i}</div>
            <div style="font-size:11px;margin-top:2px">${time} · ${b.itemCount}件衣物</div>
          </div>
          <button class="btn-secondary" onclick="restoreFromBackup('${b.id}').then(ok=>{if(ok)goHome()})" style="padding:6px 12px;font-size:12px">恢复</button>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p>备份记录加载失败</p>';
  }
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
    statsCurrentDate.setDate(1);
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
    statsCurrentDate.setDate(1);
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
    const sd = i.saleInfo?.soldDate;
    if (!sd) return false;
    const parts = sd.split('-');
    return parseInt(parts[0]) === year;
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
    const sd = i.saleInfo?.soldDate;
    if (!sd) return;
    const parts = sd.split('-');
    const m = parseInt(parts[1]) - 1;
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
    const sd = i.saleInfo?.soldDate;
    if (!sd) return false;
    const parts = sd.split('-');
    return parseInt(parts[0]) === year && parseInt(parts[1]) - 1 === month;
  });

  const count = monthItems.length;
  const amount = monthItems.reduce((sum, i) => sum + (i.saleInfo?.receivedPrice || 0), 0);
  const cost = monthItems.reduce((sum, i) => sum + (i.purchasePrice || 0) + (i.saleInfo?.extraCost || 0), 0);
  const profit = amount - cost;

  // 按日拆分
  const dailyData = {};
  monthItems.forEach(i => {
    const sd = i.saleInfo?.soldDate;
    if (!sd) return;
    const day = parseInt(sd.split('-')[2]);
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
  const y = statsCurrentDate.getFullYear();
  const m = statsCurrentDate.getMonth();
  const d = statsCurrentDate.getDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayItems = soldItems.filter(i => {
    const sd = i.saleInfo?.soldDate;
    return sd === dateStr;
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

// ===== 测试数据生成 =====
function generateTestData() {
  if (!confirm('将生成模拟6个月使用的测试数据，当前数据会被覆盖，确认继续？')) return;

  const catIds = [];
  for (let i = 0; i < 6; i++) catIds.push(genId());

  const categories = [
    { id: catIds[0], name: '上衣' },
    { id: catIds[1], name: '裤子' },
    { id: catIds[2], name: '裙子' },
    { id: catIds[3], name: '外套' },
    { id: catIds[4], name: '连衣裙' },
    { id: catIds[5], name: '配饰' }
  ];

  const batchIds = [];
  for (let i = 0; i < 8; i++) batchIds.push(genId());

  const batches = [
    { id: batchIds[0], name: '2024年12月冬装进货', date: '2024-12-05', totalCost: 3200, notes: '冬季大衣和外套' },
    { id: batchIds[1], name: '2025年1月新年款', date: '2025-01-10', totalCost: 2800, notes: '新年红色系列' },
    { id: batchIds[2], name: '2025年2月春装首批', date: '2025-02-15', totalCost: 2500, notes: '春季薄款' },
    { id: batchIds[3], name: '2025年3月春装补货', date: '2025-03-08', totalCost: 1800, notes: '热销款补货' },
    { id: batchIds[4], name: '2025年4月夏装进货', date: '2025-04-12', totalCost: 3500, notes: '夏季连衣裙和短袖' },
    { id: batchIds[5], name: '2025年5月配饰专场', date: '2025-05-06', totalCost: 1200, notes: '戒指和配饰' },
    { id: batchIds[6], name: '2025年5月夏装补货', date: '2025-05-18', totalCost: 2000, notes: '热销夏装补货' },
    { id: batchIds[7], name: '2025年6月清仓进货', date: '2025-06-01', totalCost: 800, notes: '低价清仓款' }
  ];

  const names = {
    tops: ['复古格子衬衫', '白色棉质T恤', '丝绸蝴蝶结衬衫', '牛仔短袖', '条纹针织衫', '黑色基础款背心', '蕾丝拼接上衣', 'oversize卫衣', 'polo领短袖', '灯笼袖雪纺衫'],
    pants: ['高腰阔腿裤', '直筒牛仔裤', '灯芯绒休闲裤', '黑色西装裤', '碎花哈伦裤', '白色萝卜裤', '复古背带裤', '毛边短裤'],
    skirts: ['百褶半裙', 'A字牛仔裙', '碎花长裙', '皮裙', '网纱半裙', '鱼尾裙'],
    coats: ['双面羊绒大衣', '复古风衣', '短款皮衣', '毛呢外套', '棉服', '针织开衫'],
    dresses: ['碎花连衣裙', '黑色小礼服', '丝绒吊带裙', '衬衫裙', '泡泡袖连衣裙', '旗袍改良款'],
    accessories: ['珍珠项链', '复古胸针', '丝绒发带', '编织手链', '金属戒指']
  };

  const items = [];
  const now = new Date();

  // 生成过去6个月的数据
  for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const itemsThisMonth = 5 + Math.floor(Math.random() * 6); // 每月5-10件

    for (let i = 0; i < itemsThisMonth; i++) {
      const day = 1 + Math.floor(Math.random() * 28);
      const createdDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const catIndex = Math.floor(Math.random() * 6);
      const catId = catIds[catIndex];
      const catKey = ['tops', 'pants', 'skirts', 'coats', 'dresses', 'accessories'][catIndex];
      const nameList = names[catKey];
      const itemName = nameList[Math.floor(Math.random() * nameList.length)];
      const batchIdx = Math.min(Math.floor(monthOffset / 1.2), batchIds.length - 1);

      const purchasePrice = Math.round((30 + Math.random() * 200) * 100) / 100;
      const sellingPrice = Math.round(purchasePrice * (1.5 + Math.random() * 1.5) * 100) / 100;

      // 60%在库, 30%已售, 10%已退
      const rand = Math.random();
      let status, saleInfo;

      if (rand < 0.3) {
        // 已售
        const soldDay = Math.min(day + 3 + Math.floor(Math.random() * 20), 28);
        const soldDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), soldDay);
        const actualPrice = Math.round(sellingPrice * (0.8 + Math.random() * 0.4) * 100) / 100;
        const extraCost = Math.round(Math.random() * 30 * 100) / 100;
        const received = Math.round((actualPrice - extraCost * Math.random()) * 100) / 100;
        status = 'sold';
        saleInfo = {
          actualSellingPrice: actualPrice,
          extraCost: extraCost,
          receivedPrice: received,
          soldDate: soldDate.toISOString().split('T')[0]
        };
      } else if (rand < 0.4) {
        // 已退
        status = 'returned';
        saleInfo = { actualSellingPrice: 0, extraCost: 0, receivedPrice: 0, soldDate: '' };
      } else {
        // 在库
        status = 'in_stock';
        saleInfo = { actualSellingPrice: 0, extraCost: 0, receivedPrice: 0, soldDate: '' };
      }

      items.push({
        id: genId(),
        name: itemName + (itemsThisMonth > 1 ? ` (${i + 1})` : ''),
        categoryId: catId,
        batchId: batchIds[batchIdx],
        params: {
          length: Math.round((50 + Math.random() * 70) * 10) / 10,
          chest: Math.round((70 + Math.random() * 40) * 10) / 10,
          waist: Math.round((58 + Math.random() * 30) * 10) / 10,
          shoulder: Math.round((35 + Math.random() * 20) * 10) / 10,
          sleeve: Math.round((15 + Math.random() * 40) * 10) / 10,
          hip: Math.round((80 + Math.random() * 30) * 10) / 10,
          custom: []
        },
        purchasePrice,
        sellingPrice,
        status,
        saleInfo,
        image: null,
        notes: '',
        createdAt: createdDate.toISOString(),
        updatedAt: createdDate.toISOString()
      });
    }
  }

  setData(DB_KEYS.items, items);
  setData(DB_KEYS.categories, categories);
  setData(DB_KEYS.batches, batches);
  setData(DB_KEYS.customStatuses, []);

  // 验证数据完整性
  const savedItems = getData(DB_KEYS.items);
  const savedCats = getData(DB_KEYS.categories);
  const savedBatches = getData(DB_KEYS.batches);

  const soldItems = savedItems.filter(i => i.status === 'sold');
  const inStockItems = savedItems.filter(i => i.status === 'in_stock');
  const returnedItems = savedItems.filter(i => i.status === 'returned');

  const totalPurchase = savedItems.reduce((s, i) => s + i.purchasePrice, 0);
  const totalReceived = soldItems.reduce((s, i) => s + (i.saleInfo?.receivedPrice || 0), 0);
  const totalProfit = soldItems.reduce((s, i) => s + ((i.saleInfo?.receivedPrice || 0) - i.purchasePrice - (i.saleInfo?.extraCost || 0)), 0);

  const report = [
    '测试数据生成完毕',
    '',
    `衣物总数: ${savedItems.length}`,
    `  在库: ${inStockItems.length}`,
    `  已售: ${soldItems.length}`,
    `  已退: ${returnedItems.length}`,
    '',
    `分类: ${savedCats.length} 个`,
    `批次: ${savedBatches.length} 个`,
    '',
    `进货总额: ¥${totalPurchase.toFixed(2)}`,
    `到手总额: ¥${totalReceived.toFixed(2)}`,
    `总利润: ¥${totalProfit.toFixed(2)}`,
    '',
    `存储占用: ${getStorageUsageMB()} MB`,
    '',
    '数据验证: ' + (savedItems.length === items.length ? '通过' : '失败！数据可能丢失')
  ].join('\n');

  alert(report);
  goHome();
}

// ===== 数据备份与恢复 =====
function exportData() {
  const backup = {
    version: 2,
    exportDate: new Date().toISOString(),
    items: getData(DB_KEYS.items),
    categories: getData(DB_KEYS.categories),
    batches: getData(DB_KEYS.batches),
    customStatuses: getData(DB_KEYS.customStatuses)
  };

  const json = JSON.stringify(backup);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `LiuShuiJ_backup_${dateStr}.json`;

  // 优先使用 Web Share API（iOS 原生分享菜单，可存到文件）
  if (navigator.canShare) {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const file = new File([blob], fileName, { type: 'application/json' });

      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'LiuShuiJ 数据备份'
        }).then(() => {
          showToast('已存到手机');
          hideSaveReminder();
        }).catch(() => {
          // 用户取消分享，回退到 download 方式
          downloadBackup(json, fileName);
        });
        return;
      }
    } catch (e) {
      // 回退到 download
    }
  }

  downloadBackup(json, fileName);
}

function downloadBackup(json, fileName) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('已存到手机');
  hideSaveReminder();
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);

      if (!backup.items || !backup.categories) {
        showToast('无效的备份文件');
        return;
      }

      if (!confirm(`确认导入备份？\n\n导出时间: ${backup.exportDate ? new Date(backup.exportDate).toLocaleString() : '未知'}\n衣物数量: ${backup.items.length}\n分类数量: ${backup.categories.length}\n\n当前数据将被覆盖！`)) {
        return;
      }

      setData(DB_KEYS.items, backup.items);
      setData(DB_KEYS.categories, backup.categories);
      setData(DB_KEYS.batches, backup.batches || []);
      setData(DB_KEYS.customStatuses, backup.customStatuses || []);

      showToast('数据恢复成功');
      renderStats();
    } catch (err) {
      showToast('备份文件格式错误');
      console.error('导入失败:', err);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ===== 工具函数 =====
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.add('hidden'); toastTimer = null; }, 2000);
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

  // 使用可靠的在线 QR 生成 API
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=1a1a1a&margin=10`;

  qrContainer.innerHTML = `<img src="${qrApiUrl}" alt="二维码" style="width:220px;height:220px;border-radius:2px;border:1px solid var(--border)" onerror="this.onerror=null;this.parentNode.innerHTML='<p style=\\'color:var(--text-secondary);font-size:13px\\'>二维码加载失败<br>请手动输入下方网址</p>'">`;
  qrUrlEl.textContent = url;
  document.getElementById('qrModal').classList.remove('hidden');
}

function closeQrModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

// ===== 网络状态检测 =====
let isOnline = navigator.onLine;
let networkCheckInterval = null;

function updateNetworkStatus() {
  const wasOnline = isOnline;
  isOnline = navigator.onLine;
  
  if (isOnline && !wasOnline) {
    showToast('网络已连接');
    // 网络恢复时重新加载数据
    setTimeout(() => {
      renderList();
      checkAndAutoRecover();
    }, 500);
  } else if (!isOnline && wasOnline) {
    showToast('网络已断开，使用本地数据');
  }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// 定期检查网络状态（每30秒）
function startNetworkCheck() {
  if (networkCheckInterval) clearInterval(networkCheckInterval);
  networkCheckInterval = setInterval(() => {
    updateNetworkStatus();
  }, 30000);
}

// ===== 数据加载增强 =====
async function loadDataWithRetry() {
  let retries = 3;
  while (retries > 0) {
    try {
      // 确保 localStorage 数据可用
      initDefaults();
      
      // 验证数据完整性
      const items = getData(DB_KEYS.items);
      const categories = getData(DB_KEYS.categories);
      
      // 确保数据是数组
      if (!Array.isArray(items) || !Array.isArray(categories)) {
        throw new Error('数据格式错误');
      }
      
      return true;
    } catch (e) {
      retries--;
      if (retries === 0) {
        console.error('数据加载失败:', e);
        showToast('数据加载失败，请刷新页面');
        return false;
      }
      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async function() {
  // 先初始化默认数据（确保 localStorage 有数据）
  initDefaults();
  
  // 再加载数据
  const dataLoaded = await loadDataWithRetry();
  if (!dataLoaded) {
    showToast('数据加载失败，请检查网络或刷新页面');
  }

  // 初始化 IndexedDB 备份
  try {
    await initBackupDB();
    // 检测数据丢失，自动恢复
    checkAndAutoRecover();
  } catch (e) {
    console.warn('IndexedDB 备份不可用，仅使用 localStorage');
  }

  // 设置 Firebase 实时同步
  setTimeout(() => {
    if (isFirebaseAvailable()) {
      console.log('Firebase 已启用，设置实时同步...');
      setupRealtimeSync();
      
      // 首次同步数据
      syncFromFirebase().then(() => {
        renderList();
        showToast('已连接到云端');
      });
      
      firebaseEnabled = true;
    } else {
      console.log('Firebase 未配置，使用本地存储');
      showToast('未配置云端同步，数据仅保存在本地');
    }
  }, 2000); // 等待 Firebase 初始化

  renderList();
  startNetworkCheck();

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker 注册成功');
      
      // 检查更新
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('发现新版本，刷新即可更新');
            showToast('发现新版本，请刷新页面');
          }
        });
      });
      
      // 确保 Service Worker 激活
      if (reg.active) {
        console.log('Service Worker 已激活');
      }
    } catch (err) {
      console.log('Service Worker 注册失败', err);
      showToast('离线功能不可用，请检查网络');
    }
  }
});

// ===== 新增：清除缓存功能 =====
async function clearCacheAndUpdate() {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      for (let key of keys) {
        await caches.delete(key);
      }
      showToast('缓存已清除，刷新页面');
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (let reg of regs) {
          await reg.unregister();
        }
      }
      setTimeout(() => location.reload(), 1000);
    } catch (e) {
      console.error('清除缓存失败:', e);
      showToast('清除失败，请手动刷新');
    }
  } else {
    location.reload();
  }
}
