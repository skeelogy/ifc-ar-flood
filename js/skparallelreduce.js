/**
 * @fileOverview GLSL parallel reduce in Three.js
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 *
 * Example Usage:
 * ParallelReducer.init(myWebGLRenderer, 1024, 1);
 * ParallelReducer.reduce(renderTargetToReduce, 'sum', 0);  //reduce data in the R channel
 * var resultArray = ParallelReducer.getPixelFloatData();
 * (sum data from resultArray...)
 *
 */

//FIXME: pixel access still has some problems, causing interpolated values to appear. Does not matter to 'sum' mode for some reason, but other modes like 'max' will not work.
//TODO: do a vertical flip of UVs before going into shaders, so that there's no need to constantly flip the v coordinates

/**
 * Singleton object that does GPU parallel reduction using GLSL
 */
var ParallelReducer = {

    hasInit: false,

    /**
     * Initializes the parallel reducer object
     * @param  {THREE.WebGLRenderer} renderer Renderer
     * @param  {number} res Power-of-2 resolution
     * @param  {number} stopRes Resolution to stop the reduction process (min of 1)
     */
    init: function (renderer, res, stopRes) {

        //return if has already init
        if (this.hasInit) {
            console.warn('ParallelReducer has already been initialized');
            return;
        }

        if (typeof renderer === 'undefined') {
            throw new Error('renderer not specified');
        }
        this.renderer = renderer;
        this.__checkExtensions();

        if (typeof res === 'undefined') {
            throw new Error('res not specified');
        }
        this.res = res;  //TODO: check that this is a power of 2

        this.stopRes = stopRes || 1;  //TODO: check that this is a power of 2

        if (this.res <= this.stopRes) {
            throw new Error('stopRes must be smaller than res');
        }

        this.__setupRttScene();

        this.pixelByteData = new Uint8Array(this.stopRes * this.stopRes * 4);

        this.hasInit = true;
    },

    __checkExtensions: function () {
        var context = this.renderer.context;
        if (!context.getExtension('OES_texture_float_linear')) {
            throw new Error('Extension not available: OES_texture_float_linear');
        }
    },

    __setupRttScene: function () {

        var size = 1.0;  //arbitrary

        //create a RTT scene
        this.rttScene = new THREE.Scene();

        //create an orthographic RTT camera
        var halfSize = size / 2.0;
        var far = 10000;
        var near = -far;
        this.rttCamera = new THREE.OrthographicCamera(-halfSize, halfSize, halfSize, -halfSize, near, far);

        //create quads of different sizes to invoke the shaders
        var w;
        var newMaxUv = 1.0;
        var scale = 1.0;
        var dummyTexture = new THREE.Texture();
        this.rttQuadMeshes = [];
        for (w = this.res; w >= 1; w /= 2) {

            //generate the plane geom
            var rttQuadGeom = new THREE.PlaneGeometry(size, size);
            rttQuadGeom.faceVertexUvs[0][0][0].set(0.0, 1.0);
            rttQuadGeom.faceVertexUvs[0][0][1].set(0.0, 1.0 - newMaxUv);
            rttQuadGeom.faceVertexUvs[0][0][2].set(newMaxUv, 1.0 - newMaxUv);
            rttQuadGeom.faceVertexUvs[0][0][3].set(newMaxUv, 1.0);
            rttQuadGeom.applyMatrix(new THREE.Matrix4().makeTranslation(0.5 * size, -0.5 * size, 0.0));
            rttQuadGeom.applyMatrix(new THREE.Matrix4().makeScale(scale, scale, scale));
            rttQuadGeom.applyMatrix(new THREE.Matrix4().makeTranslation(-0.5 * size, 0.5 * size, 0.0));

            //add mesh
            //have to load with a dummy map, or else we will get this WebGL error when we swap to another material with a texture:
            //"glDrawElements: attempt to access out of range vertices in attribute"
            //http://stackoverflow.com/questions/16531759/three-js-map-material-causes-webgl-warning
            var rttQuadMesh = new THREE.Mesh(rttQuadGeom, new THREE.MeshBasicMaterial({map: dummyTexture}));
            rttQuadMesh.visible = false;
            this.rttScene.add(rttQuadMesh);
            this.rttQuadMeshes.push(rttQuadMesh);

            newMaxUv /= 2.0;
            scale /= 2.0;
        }

        //create shader materials
        this.rttMaterials = {};

        THREE.ShaderManager.addShader('/glsl/passUv.vert');

        THREE.ShaderManager.addShader('/glsl/parallelSum.frag');
        this.rttMaterials.sum = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { type: 't', value: null },
                uTexelSize: { type: 'f', value: 0 },
                uHalfTexelSize: { type: 'f', value: 0 },
                uChannelMask: { type: 'v4', value: new THREE.Vector4() }
            },
            vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
            fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/parallelSum.frag')
        });

        THREE.ShaderManager.addShader('/glsl/encodeFloat.frag');
        this.rttEncodeFloatMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { type: 't', value: null },
                uChannelMask: { type: 'v4', value: new THREE.Vector4() }
            },
            vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
            fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/encodeFloat.frag')
        });

        this.channelVectors = {
            'r': new THREE.Vector4(1, 0, 0, 0),
            'g': new THREE.Vector4(0, 1, 0, 0),
            'b': new THREE.Vector4(0, 0, 1, 0),
            'a': new THREE.Vector4(0, 0, 0, 1)
        };

        //create RTT render targets
        this.nearestFloatRGBAParams = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
            type: THREE.FloatType
        };
        this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.nearestFloatRGBAParams);
        this.rttRenderTarget1.generateMipmaps = false;
        this.rttRenderTarget2 = this.rttRenderTarget1.clone();
    },

    __swapRenderTargets: function () {
        var temp = this.rttRenderTarget1;
        this.rttRenderTarget1 = this.rttRenderTarget2;
        this.rttRenderTarget2 = temp;
    },

    /**
     * Initiate the reduction process
     * @param  {THREE.Texture | THREE.WebGLRenderTarget} texture Texture which contains data for reduction
     * @param  {string} type Reduction operation type e.g. 'sum'
     * @param  {string} channelId Channel to reduce e.g. 'r'
     */
    reduce: function (texture, type, channelId) {
        var currMaterial = this.rttMaterials[type];
        var firstIteration = true;
        var texelSize = 1.0 / this.res;
        var level = 1;
        this.currRes = this.res;
        while (this.currRes > this.stopRes) {

            //reduce width by half
            this.currRes /= 2;
            // console.log('currRes: ' + this.currRes);

            //render to do parallel reduction
            this.__swapRenderTargets();
            this.rttQuadMeshes[level].visible = true;
            this.rttQuadMeshes[level].material = currMaterial;
            currMaterial.uniforms['uTexture'].value = firstIteration ? texture : this.rttRenderTarget2;
            currMaterial.uniforms['uTexelSize'].value = texelSize;
            currMaterial.uniforms['uHalfTexelSize'].value = texelSize / 2.0;
            currMaterial.uniforms['uChannelMask'].value.copy(this.channelVectors[channelId]);
            this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
            this.rttQuadMeshes[level].visible = false;

            level += 1;

            firstIteration = false;
        }
    },

    /**
     * Gets the reduced float data after reduction is done
     * @param  {string} channelId Channel to get float data from
     * @return {number} Floating point result of the reduction
     */
    getPixelFloatData: function (channelId) {

        //I need to read in pixel data from WebGLRenderTarget but there seems to be no direct way.
        //Seems like I have to do some native WebGL stuff with readPixels().

        //need to first render the float data into an unsigned byte RGBA texture
        this.__swapRenderTargets();
        this.rttQuadMeshes[0].visible = true;
        this.rttQuadMeshes[0].material = this.rttEncodeFloatMaterial;
        this.rttEncodeFloatMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.rttEncodeFloatMaterial.uniforms['uChannelMask'].value.copy(this.channelVectors[channelId]);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.rttQuadMeshes[0].visible = false;

        var gl = this.renderer.getContext();

        //bind texture to gl context
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.rttRenderTarget1.__webglFramebuffer);

        //read pixels
        gl.readPixels(0, this.res - this.stopRes, this.stopRes, this.stopRes, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelByteData);

        //unbind
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        //cast to float
        var floatData = new Float32Array(this.pixelByteData.buffer);

        return floatData;
    }
};