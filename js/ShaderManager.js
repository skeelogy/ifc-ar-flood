/**
 * @fileOverview Shader manager singleton to help in loading of external shader files
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 */

/**
 * Manager to handle parsing and loading of GLSL shaders for Three.js
 */
THREE.ShaderManager = {

    shaderContents: {},

    /**
     * Loads an external GLSL shader file
     * @param {string} url External GLSL file to load from
     * @param {boolean} async Whether to load the GLSL file asynchronously
     */
    addShader: function (url, async) {
        if (Object.keys(this.shaderContents).indexOf(url) !== -1) {
            // console.warn('shader already added: ' + url);
            return;
        }
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

    /**
     * Gets the shader text contents
     * @param  {string} url Key that identifies the shader text content
     * @return {string} Shader text
     */
    getShaderContents: function (url) {
        var content = this.shaderContents[url];
        if (!content) {
            throw new Error('Unable to access shader content using key: ' + url);
        }
        return content;
    }
};

THREE.ShaderManager.shaderContents['heightmapVS'] = [

    "uniform sampler2D uTexture;",
    "uniform vec2 uTexelSize;",
    "uniform vec2 uTexelWorldSize;",
    "uniform float uHeightMultiplier;",

    "varying vec3 vViewPos;",
    "varying vec3 vViewNormal;",
    "varying vec2 vUv;",

    THREE.ShaderChunk[ "shadowmap_pars_vertex" ],

    "void main() {",

        "vUv = uv;",

        //displace y based on texel value
        "vec4 t = texture2D(uTexture, vUv) * uHeightMultiplier;",
        "vec3 displacedPos = vec3(position.x, t.r, position.z);",

        //find normal
        "vec2 du = vec2(uTexelSize.r, 0.0);",
        "vec2 dv = vec2(0.0, uTexelSize.g);",
        "vec3 vecPosU = vec3(displacedPos.x + uTexelWorldSize.r,",
                            "texture2D(uTexture, vUv + du).r * uHeightMultiplier,",
                            "displacedPos.z) - displacedPos;",
        "vec3 vecNegU = vec3(displacedPos.x - uTexelWorldSize.r,",
                            "texture2D(uTexture, vUv - du).r * uHeightMultiplier,",
                            "displacedPos.z) - displacedPos;",
        "vec3 vecPosV = vec3(displacedPos.x,",
                            "texture2D(uTexture, vUv + dv).r * uHeightMultiplier,",
                            "displacedPos.z - uTexelWorldSize.g) - displacedPos;",
        "vec3 vecNegV = vec3(displacedPos.x,",
                            "texture2D(uTexture, vUv - dv).r * uHeightMultiplier,",
                            "displacedPos.z + uTexelWorldSize.g) - displacedPos;",
        "vViewNormal = normalize(normalMatrix * 0.25 * (cross(vecPosU, vecPosV) + cross(vecPosV, vecNegU) + cross(vecNegU, vecNegV) + cross(vecNegV, vecPosU)));",

        "vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);",
        "vec4 viewPos = modelViewMatrix * vec4(displacedPos, 1.0);",
        "vViewPos = viewPos.rgb;",

        "gl_Position = projectionMatrix * viewPos;",

        THREE.ShaderChunk[ "shadowmap_vertex" ],

    "}"
].join("\n");

THREE.ShaderManager.shaderContents['lambertFS'] = [

    "uniform vec3 uBaseColor;",
    "uniform vec3 uAmbientLightColor;",
    "uniform float uAmbientLightIntensity;",

    "varying vec3 vViewPos;",
    "varying vec3 vViewNormal;",
    "varying vec2 vUv;",

    "#if MAX_DIR_LIGHTS > 0",
        "uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];",
        "uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];",
    "#endif",

    THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

    "void main() {",

        //ambient component
        "vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;",

        //diffuse component
        "vec3 diffuse = vec3(0.0);",

        "#if MAX_DIR_LIGHTS > 0",

            "for (int i = 0; i < MAX_DIR_LIGHTS; i++) {",
                "vec4 lightVector = viewMatrix * vec4(directionalLightDirection[i], 0.0);",
                "float normalModulator = dot(normalize(vViewNormal), normalize(lightVector.xyz));",
                "diffuse += normalModulator * directionalLightColor[i];",
            "}",

        "#endif",

        "gl_FragColor = vec4(uBaseColor * (ambient + diffuse), 1.0);",

        THREE.ShaderChunk[ "shadowmap_fragment" ],

    "}"

].join("\n");

THREE.ShaderManager.shaderContents['lambertCursorFS'] = [

    "uniform vec3 uBaseColor;",
    "uniform vec3 uAmbientLightColor;",
    "uniform float uAmbientLightIntensity;",

    "uniform int uShowCursor;",
    "uniform vec2 uCursorPos;",
    "uniform float uCursorRadius;",
    "uniform vec3 uCursorColor;",

    "varying vec3 vViewPos;",
    "varying vec3 vViewNormal;",
    "varying vec2 vUv;",

    "#if MAX_DIR_LIGHTS > 0",
        "uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];",
        "uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];",
    "#endif",

    THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

    "void main() {",

        //ambient component
        "vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;",

        //diffuse component
        "vec3 diffuse = vec3(0.0);",

        "#if MAX_DIR_LIGHTS > 0",

            "for (int i = 0; i < MAX_DIR_LIGHTS; i++) {",
                "vec4 lightVector = viewMatrix * vec4(directionalLightDirection[i], 0.0);",
                "float normalModulator = dot(normalize(vViewNormal), normalize(lightVector.xyz));",
                "diffuse += normalModulator * directionalLightColor[i];",
            "}",

        "#endif",

        //combine components to get final color
        "vec3 finalColor = uBaseColor * (ambient + diffuse);",

        //mix in cursor color
        "if (uShowCursor == 1) {",
            "float len = length(vUv - vec2(uCursorPos.x, 1.0 - uCursorPos.y));",
            "finalColor = mix(finalColor, uCursorColor, smoothstep(uCursorRadius, 0.0, len));",
        "}",

        "gl_FragColor = vec4(finalColor, 1.0);",

        THREE.ShaderChunk[ "shadowmap_fragment" ],

    "}"

].join("\n");