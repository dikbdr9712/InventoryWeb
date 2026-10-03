// The live site: the website, /api and /uploads all come from one address (Nginx sends /api and /uploads
// to the Spring Boot server, see DEPLOY.md), so every path is relative.
export const environment = {
  apiUrl: '',     // '' = same address as the website
  imageBase: ''   // product photos: /uploads/... on the same address
};
