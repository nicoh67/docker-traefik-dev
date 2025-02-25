ARG PHP_VERSION=8.2
FROM php:${PHP_VERSION}-fpm

# Installer les extensions nécessaires
RUN docker-php-ext-install pdo pdo_mysql

# Copier un fichier php.ini personnalisé (facultatif)
COPY custom-php.ini /usr/local/etc/php/conf.d/custom-php.ini
