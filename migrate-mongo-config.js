import dotenv from "dotenv";
dotenv.config();

const config = {
  mongodb: {
    // TODO Change (or review) the url to your MongoDB:
    url: "mongodb+srv://byrgyin:RLQvSzK3FgpEV4dB@cluster0.udpyldq.mongodb.net/users?retryWrites=true&w=majority&appName=Cluster0",

    // TODO Change this to your database name:
    databaseName: "users",
  },

  // The migrations dir, can be an relative or absolute path. Only edit this when really necessary.
  migrationsDir: "migrations",

  // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
  changelogCollectionName: "changelog",

  // The file extension to create migrations and search for in migration dir
  migrationFileExtension: ".js",

  // Enable the algorithm to create a checksum of the file contents and use that in the comparison to determine
  // if the file should be run.  Requires that scripts are coded to be run multiple times.
  useFileHash: false,

  // Don't change this, unless you know what you're doing
  moduleSystem: 'commonjs',
};
export default config;
