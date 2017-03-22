type MemberType = "none" | "creation" | "action" | "query";
type ElementType = "none" | "category" | "group";
type ItemType = "none" | "category" | "group" | "creation" | "action" | "query";

import * as _ from 'underscore';

export class TypeListNode {

    fullyQualifiedName: string = "";
    iconUrl: string = "";
    contextData: string = "";
    memberType: MemberType = "none";

    constructor(data: any) {
        this.fullyQualifiedName = data.fullyQualifiedName;
        this.iconUrl = data.iconUrl;
        this.contextData = data.contextData;
        this.memberType = data.itemType;
    }
}

export interface IncludeInfo {
    path: string;
    iconUrl?: string;
    inclusive?: boolean;
}

export class LayoutElement {

    text: string = "";
    iconUrl: string = "";
    elementType: ElementType = "none";
    include: IncludeInfo[] = [];
    childElements: LayoutElement[] = [];

    constructor(data: any) {
        this.text = data.text;
        this.iconUrl = data.iconUrl;
        this.elementType = data.elementType;
        this.include = data.include;
        if (data.childElements) {
            for (let i = 0; i < data.childElements.length; i++) {
                this.childElements.push(new LayoutElement(data.childElements[i]));
            }
        }
    }
    appendChild(childElement: LayoutElement) {
        this.childElements.push(childElement);
    }
}

export class ItemData {

    iconUrl: string = "";
    contextData: string = "";
    itemType: ItemType = "none";
    childItems: ItemData[] = [];

    constructor(public text: string) {
    }

    constructFromLayoutElement(layoutElement: LayoutElement) {
        this.contextData = layoutElement.text;
        this.iconUrl = layoutElement.iconUrl;
        this.itemType = layoutElement.elementType;
    }

    appendChild(childItem: ItemData) {
        this.childItems.push(childItem);
    }
}

export function constructNestedLibraryItems(
    includeParts: string[],
    typeListNode: TypeListNode,
    typeListNodes: TypeListNode[],
    inclusive: boolean,
    parentItem: ItemData,
    iconUrl?: string): ItemData {
    // 'includeParts' is always lesser or equal to 'fullNameParts' in length.
    // 
    // Take an example:
    //      includeParts  = [ A, B, C ];
    //      fullNameParts = [ A, B, C, D, E ];
    // 
    let fullyQualifiedName = typeListNode.fullyQualifiedName;
    let fullNameParts: string[] = fullyQualifiedName.split('.');
    if (includeParts.length > fullNameParts.length) {
        throw new Error("Invalid input");
    }

    // If 'inclusive == true', then for the above example we start building 
    // LibraryItem from 'C' onward, otherwise it starts from 'D'.
    // 
    let startIndex = inclusive ? includeParts.length - 1 : includeParts.length;

    // Starting index may optionally include the first item in the case when 
    // 'inclusive = true'. If 'parentItem != null && inclusive == true', then 
    // the 'parentItem' is already created in a previous iteration, so we will 
    // continue to append child items under 'parentItem' without recreating 
    // a new LibraryItem from 'remainingParts[0]'.
    // 
    if (inclusive && parentItem) {
        startIndex = startIndex + 1;
    }

    let rootLibraryItem: ItemData = parentItem;
    for (let i = startIndex; i < fullNameParts.length; i++) {
        let libraryItem = new ItemData(fullNameParts[i]);
        libraryItem.itemType = "none";
        libraryItem.iconUrl = iconUrl;

        // If this is the leaf most level, copy all item information over.
        if (i == fullNameParts.length - 1) {
            libraryItem.contextData = typeListNode.contextData;
            libraryItem.iconUrl = typeListNode.iconUrl;
            libraryItem.itemType = typeListNode.memberType;

            // Remove the typeListNode from the list.
            let i = typeListNodes.indexOf(typeListNode); 
            typeListNodes[i] = null;
        }

        if (parentItem) {
            // If there was a parent item, insert the new 'libraryItem' under 
            // it as a child item, then update 'parentItem' to be 'libraryItem'.
            parentItem.appendChild(libraryItem);
            parentItem = libraryItem;
        } else {
            // If there was not a parent item, that means this is the first 
            // library item node that we create. Make it the rootLibraryItem
            // and point 'parentItem' to it.
            parentItem = libraryItem;
            rootLibraryItem = libraryItem;
        }
    }

    return rootLibraryItem;
}

/**
 * This method merges a type node (and its immediate sub nodes) under the given
 * library item.
 * 
 * Note that this is not a recursive function by design, it only considers the
 * current TypeTreeNode, and any possible child TypeTreeNode but nothing beyond
 * that depth.
 * 
 * @param {TypeTreeNode} typeTreeNode
 * The type node to be merged under the given library item. Its immediate child 
 * nodes will also be merged under the new library item, but the recursion does 
 * not go beyond that depth.
 * 
 * @param {LibraryItem} libraryItem
 * The library item under which a type node (and its sub nodes) is to be merged.
 */
export function constructLibraryItem(
    typeListNodes: TypeListNode[],
    layoutElement: LayoutElement): ItemData {
    let result = new ItemData(layoutElement.text);
    result.constructFromLayoutElement(layoutElement);

    // Traverse through the strings in 'include'
    for (let i = 0; i < layoutElement.include.length; i++) {

        let includePath = layoutElement.include[i].path;
        let includeParts = includePath.split('.');

        let inclusive = true; // If not specified, inclusive by default.
        if (layoutElement.include[i].inclusive) {
            inclusive = layoutElement.include[i].inclusive;
        }

        // If inclusive, then a new root node will be created (in the first iteration 
        // of 'j' below, and reused subsequently for all other 'j'), otherwise use the 
        // current 'result' as the parent node for child nodes to be appended.
        // 
        let parentNode = inclusive ? null : result;

        for (let j = 0; j < typeListNodes.length; j++) {
            if (typeListNodes[j]) {
                let fullyQualifiedName = typeListNodes[j].fullyQualifiedName;
                if (!fullyQualifiedName.startsWith(includePath) || !(_.contains(fullyQualifiedName.split('.'), includeParts[includeParts.length - 1]))) {
                    continue; // Not matching, skip to the next type node.
                }
                parentNode = constructNestedLibraryItems(includeParts,
                    typeListNodes[j], typeListNodes, inclusive, parentNode, layoutElement.include[i].iconUrl);
            }
        }

        if (!parentNode) {
            // Warning is displayed if the type specified in LayoutSpecs.json is not found in RawTypeData.json,
            // or if the type is specified more than once. 
            console.warn("Warning: The type '" + includePath + "' is not found in 'RawTypeData.json'. No node of this type is rendered in the library view.");
        }
        if (parentNode && (parentNode != result)) {
            // If a new parent node was created, append it as a child of 
            // the current resulting node.
            result.appendChild(parentNode);
        }
    }

    // Construct all child library items from child layout elements.
    for (let i = 0; i < layoutElement.childElements.length; i++) {
        let childLayoutElement = layoutElement.childElements[i];
        result.appendChild(constructLibraryItem(typeListNodes, childLayoutElement));
    }

    return result;
}

/**
 * Combine a data type tree and layout element tree to produce the resulting
 * library item tree.
 * 
 * @param {TypeTreeNode[]} typeTreeNodes
 * A tree of hierarchical data type identifiers. This tree is constructed 
 * based entirely on the loaded data types and their fully qualified names.
 * See TypeTreeNode for more information.
 * 
 * @param {LayoutElement[]} layoutElements
 * A tree serving as layout specifications from which library item tree is 
 * constructed. The specifications also contain information of how a given 
 * data type is merged into the resulting library item tree node.
 * 
 * @returns
 * Returns the resulting library item tree containing nodes merged from the 
 * type tree. The merging operation is done through the specifications of 
 * layout element tree.
 */
export function convertToLibraryTree(
    typeListNodes: TypeListNode[],
    layoutElements: LayoutElement[]): ItemData[] {
    let results: ItemData[] = []; // Resulting tree of library items.

    // Generate the resulting library item tree before merging data types.
    for (let i = 0; i < layoutElements.length; i++) {

        let layoutElement = layoutElements[i];
        results.push(constructLibraryItem(typeListNodes, layoutElement));
    }

    return results;
}

export function buildLibraryItemsFromLayoutSpecs(loadedTypes: any, layoutSpecs: any): ItemData[] {
    let typeListNodes: TypeListNode[] = [];
    let layoutElements: LayoutElement[] = [];

    // Converting raw data to strongly typed data.
    for (let i = 0; i < loadedTypes.loadedTypes.length; i++) {
        typeListNodes.push(new TypeListNode(loadedTypes.loadedTypes[i]));
    }

    for (let i = 0; i < layoutSpecs.elements.length; i++) {
        layoutElements.push(new LayoutElement(layoutSpecs.elements[i]));
    }

    let libraryTreeItems: ItemData[] = convertToLibraryTree(typeListNodes, layoutElements);

    let miscellaneous = new ItemData("Miscellaneous");
    miscellaneous.contextData = "Miscellaneous";
    miscellaneous.itemType = "category";
    miscellaneous.iconUrl = "/src/resources/icons/Category.List.svg";

    // Search for the items that are not removed from typeListNodes.
    _.each(typeListNodes, function (i) {
        if (i) {
            console.warn("Warning: '" + i.contextData + "' is not specified in 'LayoutSpecs.json'. The item is displayed in the 'Miscellaneous' category.");
            let newItem = new ItemData(i.fullyQualifiedName);
            newItem.contextData = i.contextData;
            newItem.iconUrl = i.iconUrl;
            newItem.itemType = i.memberType;
            miscellaneous.childItems.push(newItem);
        }
    });
    if (miscellaneous.childItems.length > 0) libraryTreeItems.push(miscellaneous);
    return libraryTreeItems;
}
