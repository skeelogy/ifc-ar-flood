//Pass-through vertex shader for passing just the transformed position to fragment shader
//author: Skeel Lee <skeel@skeelogy.com>

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}