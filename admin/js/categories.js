import { db } from '../../shared/firebase.js';
import { collection, addDoc, onSnapshot, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const categoryName = document.getElementById('categoryName');
const categoryList = document.getElementById('categoryList');
const addButton = document.getElementById('addCategory');
const categoryStatus = document.getElementById('category-status');

function setCategoryStatus(message, state='info') {
  if (!categoryStatus) return;
  categoryStatus.textContent = message;
  categoryStatus.dataset.state = state;
}

function ensureFirestoreReady() {
  if (!db) {
    alert('Firebase Firestore is not connected. Check Firebase config and project setup.');
    return false;
  }
  return true;
}

function renderCategories() {
  if (!db || !categoryList) return;

  onSnapshot(collection(db, 'categories'), (snap) => {
    categoryList.innerHTML = '';
    if (snap.empty) {
      categoryList.innerHTML = '<div class="empty-state">No categories yet.</div>';
      return;
    }

    snap.forEach((docSnap) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const data = docSnap.data();
      const name = document.createElement('span');
      name.textContent = data.name || 'Unnamed category';
      const deleteButton = document.createElement('button');
      deleteButton.className = 'del';
      deleteButton.dataset.id = docSnap.id;
      deleteButton.textContent = 'Delete';
      item.append(name, deleteButton);
      categoryList.appendChild(item);
    });
  }, (error) => {
    console.error('Could not load categories:', error);
    categoryList.textContent = 'Could not load categories. Check Firestore read permissions.';
  });
}

addButton && addButton.addEventListener('click', async () => {
  if (!ensureFirestoreReady()) return;

  const name = categoryName.value.trim();
  if (!name) return alert('Please enter a category name.');

  try {
    await addDoc(collection(db, 'categories'), {
      name,
      createdAt: Date.now()
    });
    categoryName.value = '';
    setCategoryStatus('Added', 'success');
  } catch (err) {
    console.error('Add category failed', err);
    const code = err && err.code ? err.code : 'unknown';
    const message = err && err.message ? err.message : 'Unknown error';
    alert(`Failed to add category. Firebase error: ${code} - ${message}`);
  }
});

categoryList && categoryList.addEventListener('click', async (e) => {
  const target = e.target;
  if (!target || !target.dataset.id) return;

  if (target.classList.contains('del')) {
    if (!ensureFirestoreReady()) return;
    if (!confirm('Delete this category?')) return;
    try {
      await deleteDoc(doc(db, 'categories', target.dataset.id));
    } catch (err) {
      console.error('Delete category failed', err);
      const code = err && err.code ? err.code : 'unknown';
      const message = err && err.message ? err.message : 'Unknown error';
      alert(`Failed to delete category. Firebase error: ${code} - ${message}`);
    }
  }
});

renderCategories();