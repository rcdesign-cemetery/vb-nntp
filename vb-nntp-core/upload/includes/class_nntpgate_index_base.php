<?php
abstract class NNTPGate_Index_Base
{

/**
 *
 * @var vB_Database
 */
    protected $_db = null;

    /**
     *
     * @var int
     */
    protected $_group_id = 0;

    /**
     *
     * @var int
     */
    protected $_message_id = 0;

    /**
     *
     * @var int
     */
    protected $_ref_id = null;

    /**
     *
     * @var string
     */
    protected $_title = '';

    /**
     *
     * @var int
     */
    protected $_data_time = TIMENOW;

    /**
     *
     * @var int
     */
    protected $_user_id = null;

    /**
     *
     * @var string
     */
    protected $_deleted = 'no'; //enum('yes', 'no')

    /**
     *
     * @var int
     */
    protected $_post_id = null;

    /**
     *
     * @global vB_Registry $vbulletin
     * @param vB_Database $db
     */
    public function  __construct($db = null)
    {
        if (! is_null ($db))
        {
            $this->_db = $db;
        }
        else
        {
            global $vbulletin;
            $this->_db =& $vbulletin->db;
        }

    }

    /**
     *
     * @param array $fields
     * @param int $post_id
     * @return bool
     */
    protected function _get_index_by_post($fields, $post_id = null)
    {
        if (is_null($post_id))
        {
            if (is_null($this->_post_id))
            {
                return false;
            }
            $post_id = $this->_post_id;
        }
        if (!is_array($fields) OR empty($fields))
        {
            return false;
        }
        $db_fields = array();
        foreach ($fields as $field_name)
        {
            $db_fields[$field_name] = str_replace('_', '', $field_name);
        }
        if (empty($db_fields))
        {
            return false;
        }

        $sql ="SELECT
                        " . implode( ", ", $db_fields ) . "
                    FROM
                        `" . TABLE_PREFIX . "nntp_index`
                    WHERE
                        `messagetype` = '" . $this->_get_message_type() . "'
                        AND `postid`      =  " . (int) $this->_post_id . "
                        AND `deleted`   = 'no'
                    LIMIT 1  ";
        $index = $this->_db->query_first($sql);
        if(! empty( $index ) )
        {
            foreach ($index as $field=>$value)
            {
                $prop_name = array_search($field, $db_fields);
                if (property_exists($this, $prop_name))
                {
                    $this->$prop_name = $value;
                }
            }
            return true;
        }
    }

    /**
     *
     * @return bool
     */
    public function set_message_index ()
    {

        if (empty($this->_post['message']))
        {
            return false;
        }
        $this->_get_index_by_post(array('_group_id', '_message_id'));
        if (0 == $this->_group_id )
        {
            $this->get_group_id_from_db();
        }
        // Just return unless NNTP-group found
        if( 0 == $this->_group_id)
        {
            return false;
        }
        $this->_db->query_write("
                INSERT INTO
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `groupid`    	=  " . $this->_group_id . ",
                    `messageid`  	=  " . $this->_message_id . ",
                    `refid`      	=  " . $this->_ref_id . ",
                    `userid`      =  " . $this->_user_id . ",
                    `postid`      =  " . $this->_post_id . ",
                    `messagetype` = '" . $this->_get_message_type() . "',
                    `title`       = '" . $this->_title . "',
                    `datetime`    = FROM_UNIXTIME( " . intval( $this->_data_time ) . " ),
                    `deleted`     = 'no'
                ON DUPLICATE KEY UPDATE
                    `refid`       =  " . $this->_ref_id . ",
                    `userid`      =  " .  $this->_user_id . ",
                    `postid`      =  " . $this->_post_id . ",
                    `messagetype` = '" . $this->_get_message_type() . "',
                    `title`       = '" . $this->_title . "',
                    `datetime`    = FROM_UNIXTIME( " . intval( $this->_data_time ) . " ),
                    `deleted`     = 'no'
                ");
        if( !$this->_message_id )
        {
            $this->_message_id = $this->_db->insert_id();
        }
        $this->_cache_message_save();
        return $this->_message_id;
    }

    /**
     *
     * @return bool
     */
    protected function _cache_message_save()
    {

        if( empty($this->_group_id) || empty($this->_message_id))
        {
            return false;
        }
        $body = $this->_get_message_body();

        /*
         *  Save message info to cache
         */
        $sql = "INSERT INTO
                    `" . TABLE_PREFIX . "nntp_cache_messages`
                SET
                    `groupid`   =  " . $this->_group_id . ",
                    `messageid` =  " . $this->_message_id . ",
                    `body`      = '" . $body . "'
                ON DUPLICATE KEY UPDATE
                    `body`      = '" . $body . "'";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     *
     */
    abstract protected function _get_message_body();

    /**
     *
     */
    abstract public function get_group_id_from_db($map_id = null, $external = false);

    /**
     *
     * @param int $value
     */
    public function set_ref_id($value)
    {
        $this->_ref_id = (int)$value;
    }


    /**
     *
     * @param int $value
     */
    public function set_user_id($value)
    {
        $this->_user_id = (int)$value;
    }

    /**
     *
     * @param int $value
     */
    public function set_post_id($value)
    {
        $this->_post_id = (int)$value;
    }

    /**
     *
     * @param int $group_id
     * @param int $ref_id
     * @return bool
     */
    public function delete_message_by_ref_id($group_id = 0, $ref_id = 0 )
    {
        if (!$group_id)
        {
            $group_id = $this->_group_id;
        }
        if (!$ref_id)
        {
            $ref_id = $this->_ref_id;
        }
        if( (! $group_id) || (! $ref_id ))
        {
            return false;
        }


        $where = "`groupid` = " . intval( $group_id );
        $where .= " AND `refid`   = " . intval( $ref_id );

        // mark messages in index as deleted

        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    " . $where . "
        ";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     *
     * @param vB_Database $db
     * @param string $message_type
     * @param array $postid_list
     * @return bool
     */
    public static function delete_messages_by_postid_list (&$db, $message_type, $postid_list )
    {
        if( empty( $postid_list ) )
        {
            return false;
        }

        $postid_list = array_map('intval', $postid_list);
        // mark messages in index as deleted
        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    `messagetype` = '" . $message_type . "' AND
                    `postid` IN( '" . implode( "', '", $postid_list ) . "' )";
        $db->query_write($sql);
        return true;
    }

    /**
     *
     * @param int $target_map_id
     * @param int $ref_id
     * @param bool $is_copy
     * @param array $post_list
     */
    function move_by_map_id($target_map_id, $ref_id, $is_copy = false, $post_list = null)
    {
        $this->get_group_id_from_db();
        $target_group_id = $this->get_group_id_from_db($target_map_id, true);
        if( $target_group_id && $this->_group_id != $target_group_id )
        {
            // Copy posts and index data to new destination group
            $sql ="SELECT
                    `messageid`,
                    `postid`
                FROM
                    `" . TABLE_PREFIX . "nntp_index`
                WHERE
                    `groupid` = " . intval( $this->_group_id ) . "
                    AND `refid`   = " . intval( $ref_id      ) . "
                ORDER BY
                `messageid` ASC";
            $posts = $this->_db->query_read($sql);

            // Attention! Posts ids are new when thread is copiing instead of moving
            // ($copy == true)
            // $postassoc["$oldpostid"] = $newpostid;

            while( $post = $this->_db->fetch_array( $posts ) )
            {
                $postid = $post["postid"];

                if( $copy )
                {
                // find new post id
                    $postid = $post_list[$postid];
                }

                // this check is only required for copy method to check if message
                // allready exists on the forum, do not copy hard-deleted messages
                if( intval( $postid ) > 0 )
                {
                    $sql ="INSERT INTO
						`" . TABLE_PREFIX . "nntp_index`
						( `groupid`		 ,
							`refid`			 ,
							`title`			 ,
							`datetime`   ,
							`userid`		 ,
							`deleted`    ,
							`messagetype`,
							`postid` )
					SELECT
						" . intval( $target_group_id ) . ",
						`refid`      ,
						`title`      ,
						`datetime`   ,
						`userid`     ,
						`deleted`		 ,
						`messagetype`,
						" . intval( $postid ) . "
					FROM
						`" . TABLE_PREFIX . "nntp_index`
					WHERE
								`groupid`   = " . intval( $this->_group_id        ) . "
						AND `messageid` = " . intval( $post['messageid'] );
                    $this->_db->query_write($sql);
                    $newmessageid = $this->_db->insert_id();

                    if( $newmessageid > 0 )
                    {
                        $sql = "INSERT INTO
							`" . TABLE_PREFIX . "nntp_cache_messages`
							( `groupid`		 ,
								`messageid`	 ,
								`body` )
						SELECT
							" . intval( $target_group_id   ) . ",
							" . intval( $newmessageid ) . ",
							`body`
						FROM
							`" . TABLE_PREFIX . "nntp_cache_messages`
						WHERE
									`groupid`   = " . intval( $this->_group_id        ) . "
							AND `messageid` = " . intval( $post['messageid'] );
                        $this->_db->query_write($sql);
                    }
                }
            }

            if( !$copy )
            {
            # mark messages as deleted in source group
                $sql="UPDATE
					`" . TABLE_PREFIX . "nntp_index`
				SET
					`deleted` = 'yes'
				WHERE
							`groupid` = " . intval( $this->_group_id ) . "
					AND `refid`   = " . intval( $target_map_id      );
                $this->_db->query_write($sql);
            }
        }
    }
}
