# Задание 3

Мобилизация.Гифки – сервис для поиска гифок в перерывах между занятиями.

Сервис написан с использованием [bem-components](https://ru.bem.info/platform/libs/bem-components/5.0.0/).

Работа избранного в оффлайне реализована с помощью технологии [Service Worker](https://developer.mozilla.org/ru/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Для поиска изображений используется [API сервиса Giphy](https://github.com/Giphy/GiphyAPI).

В браузерах, не поддерживающих сервис-воркеры, приложение так же должно корректно работать,
за исключением возможности работы в оффлайне.

## Структура проекта

  * `gifs.html` – точка входа
  * `assets` – статические файлы проекта
  * `vendor` –  статические файлы внешних библиотек
  * `service-worker.js` – скрипт сервис-воркера

Открывать `gifs.html` нужно с помощью локального веб-сервера – не как файл.
Это можно сделать с помощью встроенного в WebStorm/Idea веб-сервера, с помощью простого сервера
из состава PHP или Python. Можно воспользоваться и любым другим способом.

---
#### Поиск бага и ход мыслей:
При переносе приложения на сервер, в консоли светилась ошибка:
`blocks.js:474 [ServiceWorkerContainer]
DOMException: Only secure origins are allowed (see: https://goo.gl/Y0ZkNV).`
Сначала подумал, что дело в неправильном относительном пути, т.е. `root_dir/assets/assets`,
но при чтении доки выяснилось - работает либо по HTTPS, либо на локальной машине,
да и ошибка говорила об этом же.
Однако это натолкнуло на мысль по поводу `.register('./assets/service-worker.js')`.
Посмотрел документацию и выяснил, что у `register()` есть второй параметр *options*,
который имеет на данный момент одну опцию:
>- *scope*: USVString представляет собой URL который определяет доступную область
видимости сервис-воркера; определяет какой диапазон URL может контролировать сервис-воркер.
Это обычно относительный URL. Значение по умолчанию это URL, котрые соответствует корню **т.е. './' используя директорию расположения js скрипта** сервис-воркера как основу.

Затем вспомнил о 3-м шаге **«Разложить файлы красиво»** ну и далее по тексту :)

Использовать http-заголовок *Service-Worker-Allowed* не вариант, т.к. мы работаем локально,
но если бы был HTTPS, то для файла service-worker.js серверу нужно отдавать доп.заголовок,
а в вызов исправить на `.register('/asstes/service-worker.js', {'/'})`

**Решение**: переместим service-worker.js в корень сайта и изменим путь вызова в **blocks.js**.

После этого, вроде бы кэш избранного в оффлайне заработал, по крайней мере в режиме "Инкогнито" всё ОК.

Тем не менее в обычном режиме заметил баг - если гифка не прогрузилась полностью,
она всё равно добавляется в избранное и в оффайне её соответственно нет.

*Будем искать баги дальше...*
