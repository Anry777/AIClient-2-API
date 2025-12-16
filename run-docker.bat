@echo off
:: run-docker-with-credentials.bat
:: Формирует команду запуска Docker, используя переменную окружения USERPROFILE для построения путей

setlocal enabledelayedexpansion

echo Формирование команды запуска Docker...

:: Задание путей к конфигам с использованием USERPROFILE
set "AWS_SSO_CACHE_PATH=%USERPROFILE%\.aws\sso\cache"
set "GEMINI_CONFIG_PATH=%USERPROFILE%\.gemini\oauth_creds.json"

:: Проверка наличия каталога кэша AWS SSO
if exist "%AWS_SSO_CACHE_PATH%" (
    echo Найден каталог кэша AWS SSO: %AWS_SSO_CACHE_PATH%
) else (
    echo Каталог кэша AWS SSO не найден: %AWS_SSO_CACHE_PATH%
    echo Внимание: каталог кэша AWS SSO отсутствует, контейнер Docker может не получить доступ к учетным данным AWS
)

:: Проверка наличия файла конфигурации Gemini
if exist "%GEMINI_CONFIG_PATH%" (
    echo Найден файл конфигурации Gemini: %GEMINI_CONFIG_PATH%
) else (
    echo Файл конфигурации Gemini не найден: %GEMINI_CONFIG_PATH%
    echo Внимание: файл конфигурации Gemini отсутствует, контейнер Docker может не получить доступ к Gemini API
)

:: Сборка команды запуска Docker с путями, построенными из USERPROFILE
set "DOCKER_CMD=docker run -d ^"
set "DOCKER_CMD=!DOCKER_CMD! -u "$(id -u):$(id -g)" ^"
set "DOCKER_CMD=!DOCKER_CMD! --restart=always ^"
set "DOCKER_CMD=!DOCKER_CMD! --privileged=true ^"
set "DOCKER_CMD=!DOCKER_CMD! -p 3001:3000 ^"
set "DOCKER_CMD=!DOCKER_CMD! -e ARGS="--api-key 123456 --host 0.0.0.0" ^"
set "DOCKER_CMD=!DOCKER_CMD! -v "%AWS_SSO_CACHE_PATH%:/root/.aws/sso/cache" ^"
set "DOCKER_CMD=!DOCKER_CMD! -v "%GEMINI_CONFIG_PATH%:/root/.gemini/oauth_creds.json" ^"
set "DOCKER_CMD=!DOCKER_CMD! --name aiclient2api ^"
set "DOCKER_CMD=!DOCKER_CMD! aiclient2api"

:: Показ команды, которая будет выполнена
echo.
echo Сформированная команда Docker:
echo !DOCKER_CMD!
echo.

:: Сохранение команды в файл
echo !DOCKER_CMD! > docker-run-command.txt
echo Команда сохранена в файл docker-run-command.txt. Вы можете скопировать из него полную команду.

:: Запрос у пользователя: выполнять ли команду
echo.
set /p EXECUTE_CMD="Выполнить эту команду Docker сейчас? (y/n): "
if /i "!EXECUTE_CMD!"=="y" (
    echo Выполняется команда Docker...
    !DOCKER_CMD!
    if !errorlevel! equ 0 (
        echo Контейнер Docker успешно запущен!
        echo API доступен по адресу: http://localhost:3001
    ) else (
        echo Не удалось выполнить команду Docker, проверьте сообщение об ошибке
    )
) else (
    echo Команда не выполнена. Вы можете вручную скопировать её из docker-run-command.txt и выполнить.
)

echo Выполнение скрипта завершено
pause