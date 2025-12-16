#!/bin/bash
# run-docker-with-credentials.sh
# Формирует команду запуска Docker, используя переменную HOME для построения путей

echo "Формирование команды запуска Docker..."

# Задание путей к конфигам с использованием HOME
AWS_SSO_CACHE_PATH="$HOME/.aws/sso/cache"
GEMINI_CONFIG_PATH="$HOME/.gemini/oauth_creds.json"

# Проверка наличия каталога кэша AWS SSO
if [ -d "$AWS_SSO_CACHE_PATH" ]; then
    echo "Найден каталог кэша AWS SSO: $AWS_SSO_CACHE_PATH"
else
    echo "Каталог кэша AWS SSO не найден: $AWS_SSO_CACHE_PATH"
    echo "Внимание: каталог кэша AWS SSO отсутствует, контейнер Docker может не получить доступ к учетным данным AWS"
fi

# Проверка наличия файла конфигурации Gemini
if [ -f "$GEMINI_CONFIG_PATH" ]; then
    echo "Найден файл конфигурации Gemini: $GEMINI_CONFIG_PATH"
else
    echo "Файл конфигурации Gemini не найден: $GEMINI_CONFIG_PATH"
    echo "Внимание: файл конфигурации Gemini отсутствует, контейнер Docker может не получить доступ к Gemini API"
fi

# Сборка команды запуска Docker с путями, построенными из HOME
DOCKER_CMD="docker run -d \\
  -u "$(id -u):$(id -g)" \\
  --restart=always \\
  --privileged=true \\
  -p 3001:3000 \\
   -e ARGS=\"--api-key 123456 --host 0.0.0.0\" \\
  -v $AWS_SSO_CACHE_PATH:/root/.aws/sso/cache \\
  -v $GEMINI_CONFIG_PATH:/root/.gemini/oauth_creds.json \\
  --name aiclient2api \\
  aiclient2api"

# Показ команды, которая будет выполнена
echo
echo "Сформированная команда Docker:"
echo "$DOCKER_CMD"
echo

# Сохранение команды в файл
echo "$DOCKER_CMD" > docker-run-command.txt
echo "Команда сохранена в файл docker-run-command.txt. Вы можете скопировать из него полную команду."

# Запрос у пользователя: выполнять ли команду
echo
read -p "Выполнить эту команду Docker сейчас? (y/n): " EXECUTE_CMD
if [ "$EXECUTE_CMD" = "y" ] || [ "$EXECUTE_CMD" = "Y" ]; then
    echo "Выполняется команда Docker..."
    eval "$DOCKER_CMD"
    if [ $? -eq 0 ]; then
        echo "Контейнер Docker успешно запущен!"
        echo "API доступен по адресу: http://localhost:3001"
    else
        echo "Не удалось выполнить команду Docker, проверьте сообщение об ошибке"
    fi
else
    echo "Команда не выполнена. Вы можете вручную скопировать её из docker-run-command.txt и выполнить."
fi

echo "Выполнение скрипта завершено"