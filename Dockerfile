FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html jeux.html clips.html chat.html parents.html compte.html a-propos.html contact.html cookies.html styles.css lang.css app.js /usr/share/nginx/html/
COPY legal /usr/share/nginx/html/legal
COPY assets /usr/share/nginx/html/assets

RUN chown -R nginx:nginx /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
