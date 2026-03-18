const DB_NAME = 'MakeDB';
const STORE_NAME = 'widgets';
const DB_VERSION = 1;

// Singleton promise that resolves to the database instance
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
                        store.createIndex('createdAt', 'createdAt');
                    }
                };
            });
        }
        return promise;
    };
})();

export async function getAllWidgets() {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

export async function saveWidget(widget) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (!widget.id) widget.createdAt = Date.now();
    return new Promise((resolve, reject) => {
        const request = widget.id ? store.put(widget) : store.add(widget);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function deleteWidget(id) {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearAll() {
    const db = await dbPromise();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
