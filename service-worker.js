'use strict';
/**
 * @file
 * Сервис-воркер, обеспечивающий оффлайновую работу избранного
 */

const CACHE_VERSION = '1.0.0-broken';

importScripts('../vendor/kv-keeper.js-1.0.4/kv-keeper.js');


self.addEventListener('install', event => {
    const promise = preCacheAllFavorites()
        // Вопрос №1: зачем нужен этот вызов?
        // Ответ: skipWaiting вызовет activate немедленно.
        /* Развёрнутый ответ:
            Согласно документации сервис-воркер начинает работать внутри ServiceWorkerGlobalScope.
            Событие install всегда посылается первым воркеру,
            а self по идее ссылается на ServiceWorkerGlobalScope,
            Соответственно, promise, вызванный в waitUntil(), гарантирует,
            что сервис-воркер не будет установлен, если код, переданый в нее,
            не завершится успешно.
            После успешного вызова preCacheAllFavorites() по цепочке
            выполнится стрелочная функция skipWaiting() и затем console.log();
            Вызов skipWaiting() заставляет сервис-воркер перейти к с событыию activate.
        */
          .then(() => self.skipWaiting())
        .then(() => console.log('[ServiceWorker] Installed!'));

    event.waitUntil(promise);
});

self.addEventListener('activate', event => {
    const promise = deleteObsoleteCaches()
        .then(() => {
            // Вопрос №2: зачем нужен этот вызов?
            // Ответ: Вызов self.clients.claim включит сервис-воркер немедленно
            //        на всех страницах в его зоне действия.
            /* Развёрнутый ответ (из документации):
                Метод claim() интерфейса Clients позволяет активному сервис воркеру
                установить себя как активного воркера для клиентской страницы,
                когда воркер и страница находятся в одной области.
                Он запускает событие oncontrollerchange на всех клиентских страницах
                в пределах области сервис воркера.
                Этот метод может быть использован вместе с  ServiceWorkerGlobalScope.skipWaiting(),
                чтобы убедиться, что обновление соответствующего сервис воркера возымело эффект сразу же
                как на текущего клиента, так и на всех других активных клинетов.
                ---
                В данном случае, использование claim() внутри обработчика события onActivate сервис воркера,
                поэтому клиентская страница, загруженая в той же области, не нуждается в перезагрузке
                прежде чем она может быть использована сервис воркером.
            */
            self.clients.claim();

            console.log('[ServiceWorker] Activated!');
        });

    event.waitUntil(promise);
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Вопрос №3: для всех ли случаев подойдёт такое построение ключа?
    // Ответ:
    /* Развёрнутый ответ:

    */
    const cacheKey = url.origin + url.pathname;

    let response;
    if (needStoreForOffline(cacheKey)) {
        response = caches.match(cacheKey)
            .then(cacheResponse => cacheResponse || fetchAndPutToCache(cacheKey, event.request));
    } else {
        response = fetchWithFallbackToCache(event.request);
    }

    event.respondWith(response);
});

self.addEventListener('message', event => {
    const promise = handleMessage(event.data);

    event.waitUntil(promise);
});


// Положить в новый кеш все добавленные в избранное картинки
function preCacheAllFavorites() {
    return getAllFavorites()
        .then(urls => Promise.all(
            urls.map(url => fetch(url)))
        )
        .then(responses => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    return Promise.all(
                        responses.map(response => cache.put(response.url, response))
                    );
                });
        });
}

// Извлечь из БД добавленные в избранное картинки
function getAllFavorites() {
    return new Promise((resolve, reject) => {
        KvKeeper.getKeys((err, keys) => {
            if (err) {
                return reject(err);
            }

            const ids = keys
                .filter(key => key.startsWith('favorites:'))
                // 'favorites:'.length == 10
                .map(key => key.slice(10));

            Promise.all(ids.map(getFavoriteById))
                .then(urlGroups => {
                    return urlGroups.reduce((res, urls) => res.concat(urls), []);
                })
                .then(resolve, reject);
        });
    });
}

// Извлечь из БД запись о картинке
function getFavoriteById(id) {
    return new Promise((resolve, reject) => {
        KvKeeper.getItem('favorites:' + id, (err, val) => {
            if (err) {
                return reject(err);
            }

            const data = JSON.parse(val);
            const images = [data.fallback].concat(data.sources.map(item => item.url));

            resolve(images);
        });
    });
}

// Удалить неактуальный кеш
function deleteObsoleteCaches() {
    return caches.keys()
        .then(names => {
            // Вопрос №4: зачем нужна эта цепочка вызовов?
            // Ответ: При событии onActivate первым идёт вызов функции
            //        deleteObsoleteCaches(), которая удаляет устаревший кэш.
            /* Развёрнутый ответ:
                Создаётся массив names, в который записывются все name !== CACHE_VERSION,
                т.е. если мы изменим в самом начале константу CACHE_VERSION на новую,
                после того как мы сделаем UNREGISTER для текущего service-worker.js,
                весь кэш будет считаться устаревшим и удалится.
            */
            return Promise.all(
                names.filter(name => name !== CACHE_VERSION)
                    .map(name => {
                        console.log('[ServiceWorker] Deleting obsolete cache:', name);
                        return caches.delete(name);
                    })
            );
        });
}

// Нужно ли при скачивании сохранять ресурс для оффлайна?
function needStoreForOffline(cacheKey) {
    return cacheKey.includes('vendor/') ||
        cacheKey.includes('assets/') ||
        cacheKey.endsWith('jquery.min.js');
}

// Скачать и добавить в кеш
function fetchAndPutToCache(cacheKey, request) {
    return fetch(request)
        .then(response => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    // Вопрос №5: для чего нужно клонирование?
                    cache.put(cacheKey, response.clone());
                })
                .then(() => response);
        })
        .catch(err => {
            console.error('[ServiceWorker] Fetch error:', err);
            return caches.match(cacheKey);
        });
}

// Попытаться скачать, при неудаче обратиться в кеш
function fetchWithFallbackToCache(request) {
    return fetch(request)
        .catch(() => {
            console.log('[ServiceWorker] Fallback to offline cache:', request.url);
            return caches.match(request.url);
        });
}

// Обработать сообщение от клиента
const messageHandlers = {
    'favorite:add': handleFavoriteAdd
};

function handleMessage(eventData) {
    const message = eventData.message;
    const id = eventData.id;
    const data = eventData.data;

    console.log('[ServiceWorker] Got message:', message, 'for id:', id);

    const handler = messageHandlers[message];
    return Promise.resolve(handler && handler(id, data));
}

// Обработать сообщение о добавлении новой картинки в избранное
function handleFavoriteAdd(id, data) {
    return caches.open(CACHE_VERSION)
        .then(cache => {
            const urls = [].concat(
                data.fallback,
                (data.sources || []).map(item => item.url)
            );

            return Promise
                .all(urls.map(url => fetch(url)))
                .then(responses => {
                    return Promise.all(
                        responses.map(response => cache.put(response.url, response))
                    );
                });
        });
}
