/**
 * @fileOverview Shader manager singleton to help in loading of external shader files
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 */

THREE.ShaderManager = {

    shaderContents: {},

    addShader: function (url, async) {
        async = typeof async === 'undefined' ? false : async;
        if (typeof async !== 'boolean') {
            throw new Error('parameter "async" must be a boolean');
        }
        this.__loadShaderContents(url, async);
    },

    __loadShaderContents: function (url, async) {
        var that = this;
        $.ajax({
            url: url,
            async: async
        }).done(function (data) {
            that.shaderContents[url] = data;
        }).error(function (xhr, textStatus, error) {
            throw new Error('error loading ' + url + ': ' + error);
        });
    },

    getShaderContents: function (url) {
        var content = this.shaderContents[url];
        if (!content) {
            throw new Error('Unable to access shader content using key: ' + url);
        }
        return content;
    }
};