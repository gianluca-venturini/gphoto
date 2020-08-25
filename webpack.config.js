const webpack = require('webpack');
const path = require('path');
const nodeExternals = require('webpack-node-externals');

const PROJECTS = (process.env.PROJECTS || '').split(',');
const IS_WATCH = !!process.env.WATCH;

const resolveConfig = {
    symlinks: false,
    extensions: ['.js', '.json', '.ts', '.tsx']
};

const includeDirs = ['src'].map(x => path.resolve(__dirname, x));

const moduleConfig = (tscOptions = {}) => ({
    rules: [
        {
            test: /\.(ts|tsx)$/,
            include: includeDirs,
            use: [
                {
                    loader: 'ts-loader',
                    options: {
                        compilerOptions: {
                            ...tscOptions
                        }
                    }
                }
            ]
        }
    ]
});

/**
 * Lets server side webpack bundles use sourcemaps
 * See: https://decembersoft.com/posts/how-to-fix-your-server-side-typescript-call-stack-with-webpack-bannerplugin/
 */
const sourceMapBannerPlugin = new webpack.BannerPlugin({ banner: 'require("source-map-support").install();', raw: true, entryOnly: false });

const backendBuild = (name, entryFile, outputFile = 'server.js') => {
    return {
        name: name,
        target: 'node',
        node: {
            __dirname: false,
            __filename: false,
        },
        entry: entryFile,
        output: {
            path: __dirname + '/dist',
            filename: outputFile,
            pathinfo: true
        },
        watch: IS_WATCH,
        module: moduleConfig({ target: 'ES2017', module: 'ES6' }),
        mode: 'development',
        devtool: 'source-map',
        resolve: resolveConfig,
        // ignores node_modules
        externals: [nodeExternals()],
        plugins: [sourceMapBannerPlugin]
    };
}

const availableProjects = {

    backend: backendBuild('backend', './src/backend/main.ts', 'server.js'),

};

module.exports = PROJECTS.map(p => availableProjects[p]);
