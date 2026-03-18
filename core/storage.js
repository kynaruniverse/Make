const DB_NAME = 'MakeDB';
const STORE_NAME = 'items';
const DB_VERSION = 2;

const dbPromise = (() => {
    let promise;
    return () => {
        if (!promise) {
            promise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('type', 'type');
                        store.createIndex('layer', 'layer');
                        store.createIndex('position', 'position');
                    }
                };
            });
        }
        return promise;
    };
})();

export async function getAllItems() {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
    });
}

export async function getItemsByLayer(layer) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('layer');
    return new Promise((resolve) => {
        const request = index.getAll(layer);
        request.onsuccess = () => resolve(request.result || []);
    });
}

export async function saveItem(item) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (!item.id) {
        item.createdAt = Date.now();
    }
    item.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
        const request = item.id ? store.put(item) : store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteItem(id) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function updateItemPosition(id, position) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            item.position = position;
            const putRequest = store.put(item);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}
