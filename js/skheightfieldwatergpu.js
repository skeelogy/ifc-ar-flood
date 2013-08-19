/**
 * @fileOverview GPU JavaScript/GLSL height field water simulations for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 */

/**
 * Abstract base class for GPU height field water simulations
 * @constructor
 */
function GpuHeightFieldWater(options) {

    if (typeof options.mesh === 'undefined') {
        throw new Error('mesh not specified');
    }
    this.mesh = options.mesh;
    if (typeof options.renderer === 'undefined') {
        throw new Error('renderer not specified');
    }
    this.renderer = options.renderer;
    if (typeof options.size === 'undefined') {
        throw new Error('size not specified');
    }
    this.size = options.size;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.res = options.res;
    if (typeof options.dampingFactor === 'undefined') {
        throw new Error('dampingFactor not specified');
    }
    this.__dampingFactor = options.dampingFactor;
    this.__defineGetter__('dampingFactor', function () {
        return this.__dampingFactor;
    });
    this.__defineSetter__('dampingFactor', function (value) {
        this.__dampingFactor = value;
        this.waterSimMaterial.uniforms.uDampingFactor.value = value;
    });

    this.halfSize = this.size / 2.0;
    this.segmentSize = this.size / this.res;
    this.segmentSizeSquared = this.segmentSize * this.segmentSize;
    this.texelSize = 1.0 / this.res;

    this.isDisturbing = false;
    this.disturbUvPos = new THREE.Vector2();

    this.linearFloatParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.init();
}
/**
 * Initializes the sim
 */
GpuHeightFieldWater.prototype.init = function () {
    this.__checkExtensions();
    this.__setupShaders();
    this.__setupRttScene();
    this.__setupVtf();
};
GpuHeightFieldWater.prototype.getWaterFragmentShaderUrl = function () {
    throw new Error('Abstract method not implemented');
};
GpuHeightFieldWater.prototype.__setupShaders = function () {
    THREE.ShaderManager.addShader('/glsl/passUv.vert');
    THREE.ShaderManager.addShader('/glsl/hfWater_disturb.frag');
    THREE.ShaderManager.addShader(this.getWaterFragmentShaderUrl());
    THREE.ShaderManager.addShader('/glsl/heightMap.vert');
    THREE.ShaderManager.addShader('/glsl/lambert.frag');

    this.disturbMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uIsDisturbing: { type: 'i', value: 0 },
            uDisturbPos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
            uDisturbAmount: { type: 'f', value: 0.05 },
            uDisturbRadius: { type: 'f', value: 0.0025 * this.size }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_disturb.frag')
    });

    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.size / this.res, this.size / this.res) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uDt: { type: 'f', value: 0.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });
};
/**
 * Sets up the render-to-texture scene (2 render targets by default)
 */
GpuHeightFieldWater.prototype.__setupRttScene = function () {

    //TODO: some of these belong in superclass

    //create a RTT scene
    this.rttScene = new THREE.Scene();

    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.rttCamera = new THREE.OrthographicCamera(-this.halfSize, this.halfSize, this.halfSize, -this.halfSize, near, far);

    //create a quad which we will use to invoke the shaders
    this.rttQuadGeom = new THREE.PlaneGeometry(this.size, this.size);
    this.rttQuadMesh = new THREE.Mesh(this.rttQuadGeom, this.waterSimMaterial);
    this.rttScene.add(this.rttQuadMesh);

    //create RTT render targets (we need two to do feedback)
    this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.rttRenderTarget1.generateMipmaps = false;
    this.rttRenderTarget2 = this.rttRenderTarget1.clone();
};
/**
 * Sets up the vertex-texture-fetch for the given mesh
 */
GpuHeightFieldWater.prototype.__setupVtf = function () {
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.rttRenderTarget1 },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.segmentSize, this.segmentSize) },
            uHeightMultiplier: { type: 'f', value: 1.0 },
            uBaseColor: { type: 'v3', value: new THREE.Vector3(0.2, 1, 1) },
            uAmbientLightColor: { type: 'v3', value: new THREE.Vector3(1, 1, 1) },
            uAmbientLightIntensity: { type: 'f', value: 0.1 },
            uPointLight1Pos: { type: 'v3', value: new THREE.Vector3(2, 2, 2) },
            uPointLight1Color: { type: 'v3', value: new THREE.Vector3(1, 0, 0) },
            uPointLight1Intensity: { type: 'f', value: 3.0 },
            uPointLight1FalloffStart: { type: 'f', value: 1.0 },
            uPointLight1FalloffEnd: { type: 'f', value: 10.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/heightMap.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/lambert.frag')
    });
};
/**
 * Checks for WebGL extensions. Checks for OES_texture_float_linear and vertex texture fetch capability by default.
 */
GpuHeightFieldWater.prototype.__checkExtensions = function (renderer) {
    var context = this.renderer.context;
    if (!context.getExtension('OES_texture_float_linear')) {
        throw new Error('Extension not available: OES_texture_float_linear');
    }
    if (!context.getParameter(context.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) {
        throw new Error('Vertex textures not supported on your graphics card');
    }
};
GpuHeightFieldWater.prototype.disturb = function (position, amount) {
    this.isDisturbing = true;
    this.disturbUvPos.x = (position.x + this.halfSize) / this.size;
    this.disturbUvPos.y = (position.z + this.halfSize) / this.size;
};
GpuHeightFieldWater.prototype.disturbPass = function () {
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbMaterial;
        this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTarget2;
        this.rttQuadMesh.material.uniforms.uIsDisturbing.value = this.isDisturbing;
        this.rttQuadMesh.material.uniforms.uDisturbPos.value.copy(this.disturbUvPos);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();
        this.isDisturbing = false;
    }
};
GpuHeightFieldWater.prototype.waterSimPass = function (dt) {
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTarget2;
    this.rttQuadMesh.material.uniforms.uDt.value = dt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();
}
GpuHeightFieldWater.prototype.update = function (dt) {

    //PASS 1: disturb
    this.disturbPass();

    //PASS 2: water sim
    this.waterSimPass(dt);

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms.uTexture.value = this.rttRenderTarget1;
};
GpuHeightFieldWater.prototype.swapRenderTargets = function () {
    var temp = this.rttRenderTarget1;
    this.rttRenderTarget1 = this.rttRenderTarget2;
    this.rttRenderTarget2 = temp;
    // this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTarget2;
};

/**
 * GPU height field water simulation based on "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuMuellerGdc2008Water(options) {

    if (typeof options.horizontalSpeed === 'undefined') {
        throw new Error('horizontalSpeed not specified');
    }
    this.horizontalSpeed = options.horizontalSpeed;

    GpuHeightFieldWater.call(this, options);

    this.maxDt = this.segmentSize / this.horizontalSpeed;  //based on CFL condition
}
//inherit
GpuMuellerGdc2008Water.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuMuellerGdc2008Water.prototype.constructor = GpuMuellerGdc2008Water;
//override
GpuMuellerGdc2008Water.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_muellerGdc2008.frag';
};
GpuMuellerGdc2008Water.prototype.__setupRttScene = function () {
    GpuHeightFieldWater.prototype.__setupRttScene.call(this);
    this.rttQuadMesh.material.uniforms.uHorizontalSpeed = { type: 'f', value: this.horizontalSpeed };
};
GpuMuellerGdc2008Water.prototype.update = function (dt) {

    //fix dt for the moment because I am using the simplest integrator
    //better to be slower than to explode
    dt = 1.0 / 60.0;

    var substeps = Math.ceil(1.5 * dt / this.maxDt);  //not always stable without a multiplier (using 1.5 now)
    var substepDt = dt / substeps;

    //PASS 1: disturb
    this.disturbPass();

    //PASS 2: water sim
    var i;
    for (i = 0; i < substeps; i++) {
        this.waterSimPass(substepDt);
    }

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms.uTexture.value = this.rttRenderTarget1;
};

/**
 * GPU height field water simulation based on HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuMuellerGdc2008HwWater(options) {
    GpuHeightFieldWater.call(this, options);
}
//inherit
GpuMuellerGdc2008HwWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuMuellerGdc2008HwWater.prototype.constructor = GpuMuellerGdc2008HwWater;
//override
GpuMuellerGdc2008HwWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_muellerGdc2008Hw.frag';
};

/**
 * GPU height field water simulation based on http://freespace.virgin.net/hugo.elias/graphics/x_water.htm
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuXWater(options) {
    GpuHeightFieldWater.call(this, options);
}
//inherit
GpuXWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuXWater.prototype.constructor = GpuXWater;
//override
GpuXWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_xWater.frag';
};



/**
 * GPU height field water based on the hydrostatic pipe model
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuPipeModelWater(options) {
    GpuHeightFieldWater.call(this, options);

    //some constants
    this.gravity = 9.81;
    this.density = 1;
    this.atmosPressure = 0;  //assume one constant atmos pressure throughout
    this.pipeLength = this.segmentSize;
    this.pipeCrossSectionArea = this.pipeLength * this.pipeLength;  //square cross-section area
    this.heightToFluxFactorNoDt = this.pipeCrossSectionArea * this.gravity / this.pipeLength;
}
//inherit
GpuPipeModelWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuPipeModelWater.prototype.constructor = GpuPipeModelWater;
//override
GpuPipeModelWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_pipeModel.frag';
};
GpuPipeModelWater.prototype.__setupShaders = function () {

    GpuHeightFieldWater.prototype.__setupShaders.call(this);

    THREE.ShaderManager.addShader('/glsl/hfWater_pipeModel_calcFlux.frag');
    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uBaseHeightTexture: { type: 't', value: null },
            uHeightTexture: { type: 't', value: null },
            uFluxTexture: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uHeightToFluxFactor: { type: 'f', value: 0.0 },
            uSegmentSizeSquared: { type: 'f', value: this.segmentSizeSquared },
            uDt: { type: 'f', value: 0.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_pipeModel_calcFlux.frag')
    });

    this.waterSimMaterial2 = new THREE.ShaderMaterial({
        uniforms: {
            uHeightTexture: { type: 't', value: null },
            uFluxTexture: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uSegmentSizeSquared: { type: 'f', value: this.segmentSizeSquared },
            uDt: { type: 'f', value: 0.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });


};
GpuPipeModelWater.prototype.__setupRttScene = function () {

    GpuHeightFieldWater.prototype.__setupRttScene.call(this);

    //create RTT render targets for flux (we need two to do feedback)
    this.rttRenderTargetFlux1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.rttRenderTargetFlux1.generateMipmaps = false;
    this.rttRenderTargetFlux2 = this.rttRenderTargetFlux1.clone();
};
GpuPipeModelWater.prototype.update = function (dt) {

    dt = 1.0 / 60.0; //TODO: do substeps based on CFL
    dt /= 5.0;

    //PASS 1: disturb
    this.disturbPass();

    //PASS 2: calculate flux
    this.rttQuadMesh.material = this.waterSimMaterial;
    //TODO: get the correct render targets
    // this.rttQuadMesh.material.uniforms.uBaseHeightTexture.value = this.rttRenderTarget2;
    this.rttQuadMesh.material.uniforms.uHeightTexture.value = this.rttRenderTarget2;
    this.rttQuadMesh.material.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
    this.rttQuadMesh.material.uniforms.uHeightToFluxFactor.value = this.heightToFluxFactorNoDt * dt;
    this.rttQuadMesh.material.uniforms.uDt.value = dt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux1, false);
    this.swapFluxRenderTargets();

    //PASS 3: water sim
    this.rttQuadMesh.material = this.waterSimMaterial2;
    //TODO: get the correct render targets
    this.rttQuadMesh.material.uniforms.uHeightTexture.value = this.rttRenderTarget2;
    this.rttQuadMesh.material.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
    this.rttQuadMesh.material.uniforms.uDt.value = dt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms.uTexture.value = this.rttRenderTarget1;
};
GpuPipeModelWater.prototype.swapFluxRenderTargets = function () {
    var temp = this.rttRenderTargetFlux1;
    this.rttRenderTargetFlux1 = this.rttRenderTargetFlux2;
    this.rttRenderTargetFlux2 = temp;
    // this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTargetFlux2;
};