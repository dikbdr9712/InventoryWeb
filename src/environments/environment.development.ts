// ng serve: proxy.conf.json sends /api and /uploads to Spring Boot on port 8080, so the paths stay relative
// here too (the same as on the live site).
export const environment = {
  apiUrl: '',
  imageBase: ''
};
