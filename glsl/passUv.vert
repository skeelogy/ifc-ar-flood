//Pass-through vertex shader for passing interpolated UVs to fragment shader
//author: Skeel Lee <skeel@skeelogy.com>

varying vec2 vUv;

void main() {
    vUv = vec2(uv.x, uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}